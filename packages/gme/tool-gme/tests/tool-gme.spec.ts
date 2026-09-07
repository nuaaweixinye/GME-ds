import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { ShellExecutor, type ShellExecRequest, type ShellExecSpec, type ShellRunResult } from '@deepseek-ai/dsh-shell'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { buildGmeCommand, buildGtestCommand } from '../src/commands.ts'
import { parseModuleDependencies } from '../src/indexer.ts'
import { inspectDeliveryDiff } from '../src/delivery.ts'
import * as ToolGme from '../src/index.ts'

const signal = new AbortController().signal

function shellResult(stdout = '', overrides: Partial<ShellRunResult> = {}): ShellRunResult {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    aborted: false,
    timeoutMs: 60_000,
    stdout: { text: stdout, truncated: false },
    stderr: { text: '', truncated: false },
    ...overrides,
  }
}

class FakeShell extends ShellExecutor {
  requests: ShellExecRequest[] = []
  handler: (spec: ShellExecSpec) => ShellRunResult = () => shellResult()

  override resolve(request: ShellExecRequest): ShellExecSpec {
    this.requests.push(request)
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs: request.timeoutMs ?? 60_000,
      stdoutMaxBytes: request.stdoutMaxBytes ?? 64_000,
      ...request.signal ? { signal: request.signal } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    return this.handler(spec)
  }

  override start(): never {
    throw new Error('background execution is not used by GME tools')
  }
}

function firstText(result: ToolExecutionResult): string {
  const block = result.content[0]
  if (block?.type !== 'text') throw new Error('expected text tool output')
  return block.text
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-gme-'))
  await writeFile(join(root, 'CMakeLists.txt'), 'project(GME-ACIS)\n')
  await writeFile(join(root, '.gitmodules'), '[submodule "module/base"]\n\tpath = module/base\n')
  await mkdir(join(root, 'include', 'gme'), { recursive: true })
  return root
}

async function mount(root: string): Promise<{
  ctx: Context
  shell: FakeShell
  call: (name: string, args: unknown) => Promise<ToolExecutionResult>
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FakeShell)
  const fiber = await ctx.plugin(ToolGme, { projectRoot: root })
  let counter = 0
  return {
    ctx,
    shell: ctx.shell as FakeShell,
    call: (name, args) => ctx.tools.execute({
      signal,
      callId: ToolCallId(`gme-${++counter}`),
      name,
      arguments: args,
    }),
    dispose: async () => { await fiber.dispose() },
  }
}

describe('GME P0 tools', () => {
  const roots: string[] = []
  const disposers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (disposers.length > 0) await disposers.pop()?.()
    while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
  })

  it('reports branch, dirty state, submodule classes, and tool versions', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)
    runtime.shell.handler = (spec) => {
      if (spec.command === 'git status --porcelain=v1 --branch') return shellResult('## feature/gme\n M CMakeLists.txt\n')
      if (spec.command === 'git submodule status --recursive') {
        return shellResult(
          ' 1111111 module/base (heads/main)\n'
          + '-2222222 module/kernel\n'
          + '+3333333 module/query (heads/dev)\n'
          + 'U4444444 module/laws\n',
        )
      }
      if (spec.command === 'git --version') return shellResult('git version 2.51.0.windows.1\n')
      if (spec.command === 'cmake --version') return shellResult('cmake version 3.31.0\n')
      return shellResult('', { exitCode: 1, stderr: { text: `unexpected: ${spec.command}`, truncated: false } })
    }

    const result = await runtime.call('gme_project_status', {})

    expect(result.isError).toBe(false)
    expect(firstText(result)).toContain('Branch: feature/gme')
    expect(firstText(result)).toContain('Working tree: dirty')
    expect(firstText(result)).toContain('Submodules: 4 total, 1 aligned, 1 missing, 1 divergent, 1 conflicted')
    expect(firstText(result)).toContain('git version 2.51.0.windows.1')
    expect(firstText(result)).toContain('cmake version 3.31.0')
  })

  it('rejects a directory that is not a GME-ACIS superproject before shell execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-not-gme-'))
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)

    const result = await runtime.call('gme_project_status', {})

    expect(result.isError).toBe(true)
    expect(firstText(result)).toContain('not a GME-ACIS project')
    expect(runtime.shell.requests).toHaveLength(0)
  })

  it('builds literal all-module and one-module commands for each platform', () => {
    expect(buildGmeCommand({
      buildDirectory: 'build', configuration: 'Debug', target: 'tests', configure: true, scope: 'all',
    }, 'win32')).toBe(
      'cmake -S . -B "build" -G "Visual Studio 17 2022" -A x64 -DBUILD_ALL_MODULE=ON -DTEST_ALL_MODULE=ON; '
      + 'if ($LASTEXITCODE -eq 0) { cmake --build "build" --target tests --config Debug }',
    )
    expect(buildGmeCommand({
      buildDirectory: 'out/gme', configuration: 'Release', target: 'constructors', configure: true,
      scope: 'module', module: 'constructors',
    }, 'linux')).toBe(
      'cmake -S . -B "out/gme" -DBUILD_ALL_MODULE=OFF -DDEVELOP_CONSTRUCTORS=ON && '
      + 'cmake --build "out/gme" --target constructors --config Release',
    )
  })

  it('builds platform-specific GoogleTest commands', () => {
    expect(buildGtestCommand({
      buildDirectory: 'build', configuration: 'Debug', filter: 'Constructors_*', repeat: 2,
    }, 'win32')).toBe('"build/Debug/tests.exe" --gtest_filter="Constructors_*" --gtest_repeat=2')
    expect(buildGtestCommand({
      buildDirectory: 'build', configuration: 'Release', filter: 'Kernel.Case', repeat: 1,
    }, 'linux')).toBe('"build/tests" --gtest_filter="Kernel.Case" --gtest_repeat=1')
  })

  it('executes controlled build and test commands in the project root', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)

    const build = await runtime.call('gme_build', {
      scope: 'module', module: 'constructors', configuration: 'Release', target: 'tests',
      build_directory: 'build-gme', configure: true,
    })
    const test = await runtime.call('gme_test', {
      filter: 'Constructors_*', configuration: 'Release', build_directory: 'build-gme', repeat: 1,
    })

    expect(build.isError).toBe(false)
    expect(test.isError).toBe(false)
    expect(runtime.shell.requests).toHaveLength(2)
    expect(runtime.shell.requests.every(request => request.workdir === root)).toBe(true)
    expect(runtime.shell.requests[0]?.command).toContain('-DDEVELOP_CONSTRUCTORS=ON')
    expect(runtime.shell.requests[1]?.command).toContain('--gtest_filter="Constructors_*"')
  })

  it('rejects command injection before invoking the shell', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)

    const build = await runtime.call('gme_build', {
      scope: 'module', module: 'constructors; Remove-Item', configuration: 'Debug', target: 'tests',
    })
    const test = await runtime.call('gme_test', {
      filter: 'Kernel.*"; Remove-Item', configuration: 'Debug',
    })

    expect(build.isError).toBe(true)
    expect(test.isError).toBe(true)
    expect(runtime.shell.requests).toHaveLength(0)
  })
})

describe('GME P1 API index', () => {
  const roots: string[] = []
  const disposers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (disposers.length > 0) await disposers.pop()?.()
    while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
  })

  it('computes direct, transitive, and reverse module dependencies', () => {
    const graph = parseModuleDependencies(`
      set(BASE_DEPS)
      set(LAWS_DEPS "base")
      set(KERNEL_DEPS "laws")
      set(CONSTRUCTORS_DEPS "kernel")
      set(QUERY_DEPS "constructors" "base")
    `)

    expect(graph.direct('query')).toEqual(['base', 'constructors'])
    expect(graph.transitive('query')).toEqual(['base', 'constructors', 'kernel', 'laws'])
    expect(graph.dependants('kernel')).toEqual(['constructors', 'query'])
  })

  it('locates and classifies current-checkout API matches with module impact', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    await writeFile(join(root, 'CMakeLists.txt'), `
      project(GME-ACIS)
      set(BASE_DEPS)
      set(KERNEL_DEPS "base")
      set(CONSTRUCTORS_DEPS "kernel")
      set(QUERY_DEPS "constructors")
    `)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)
    runtime.shell.handler = (spec) => {
      if (spec.command.startsWith('rg --fixed-strings')) {
        return shellResult(
          'include/gme/constructors/cstrapi.hxx:41:DECL_CSTR outcome gme_api_make_box();\n'
          + 'module/constructors/src/cstrapi.cpp:88:outcome gme_api_make_box() {\n'
          + 'tests/gme/src/constructors/cstrapi_test.cpp:19:TEST(Api, gme_api_make_box) {\n',
        )
      }
      return shellResult('', { exitCode: 1 })
    }

    const result = await runtime.call('gme_locate_api', { symbol: 'gme_api_make_box' })

    expect(result.isError).toBe(false)
    const text = firstText(result)
    expect(text).toContain('Module: constructors')
    expect(text).toContain('Direct dependencies: kernel')
    expect(text).toContain('Transitive dependencies: base, kernel')
    expect(text).toContain('Affected dependants: query')
    expect(text).toContain('Declaration: include/gme/constructors/cstrapi.hxx:41')
    expect(text).toContain('Implementation: module/constructors/src/cstrapi.cpp:88')
    expect(text).toContain('Test: tests/gme/src/constructors/cstrapi_test.cpp:19')
  })

  it('rejects an invalid C++ identifier before search execution', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)

    const result = await runtime.call('gme_locate_api', { symbol: 'gme_api_make_box; Remove-Item' })

    expect(result.isError).toBe(true)
    expect(firstText(result)).toContain('symbol must be a C++ identifier')
    expect(runtime.shell.requests).toHaveLength(0)
  })
})

describe('GME P2 delivery gate', () => {
  const roots: string[] = []
  const disposers: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (disposers.length > 0) await disposers.pop()?.()
    while (roots.length > 0) await rm(roots.pop()!, { recursive: true, force: true })
  })

  it('finds forbidden ACIS calls only on added production lines', () => {
    const report = inspectDeliveryDiff(`
diff --git a/module/constructors/src/box.cpp b/module/constructors/src/box.cpp
--- a/module/constructors/src/box.cpp
+++ b/module/constructors/src/box.cpp
@@ -8 +8,2 @@
-  return api_make_box(input, output);
+  prepare_output(output);
+  return api_make_box(input, output);
diff --git a/tests/gme/src/constructors/box_test.cpp b/tests/gme/src/constructors/box_test.cpp
--- a/tests/gme/src/constructors/box_test.cpp
+++ b/tests/gme/src/constructors/box_test.cpp
@@ -10,0 +11 @@
+  EXPECT_TRUE(api_make_box(input, acis_output).ok());
`, 'api_make_box')

    expect(report).toEqual([{
      path: 'module/constructors/src/box.cpp',
      line: 9,
      text: 'return api_make_box(input, output);',
    }])
  })

  it('reports changed submodules and forbidden production calls through the tool', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)
    runtime.shell.handler = (spec) => {
      if (spec.command === 'git status --porcelain=v1') {
        return shellResult(' m module/constructors\n')
      }
      if (spec.command === 'git submodule status --recursive') {
        return shellResult(' 1111111 module/constructors (heads/work)\n 2222222 tests/gme (heads/main)\n')
      }
      if (spec.command === 'git rev-parse HEAD:module/constructors') {
        return shellResult(`${'a'.repeat(40)}\n`)
      }
      if (spec.command === 'git diff --unified=0 --no-ext-diff HEAD') {
        if (spec.workdir === root) return shellResult('')
      }
      if (spec.command === `git diff --unified=0 --no-ext-diff ${'a'.repeat(40)} --`) {
        return shellResult(
          'diff --git a/src/box.cpp b/src/box.cpp\n'
          + '--- a/src/box.cpp\n'
          + '+++ b/src/box.cpp\n'
          + '@@ -20,0 +21 @@\n'
          + '+return api_make_box(input, output);\n',
        )
      }
      return shellResult('', { exitCode: 1 })
    }

    const result = await runtime.call('gme_delivery_check', { forbidden_symbol: 'api_make_box' })

    expect(result.isError).toBe(false)
    expect(firstText(result)).toContain('Changed submodules: module/constructors (dirty)')
    expect(firstText(result)).toContain('Forbidden production calls: 1')
    expect(firstText(result)).toContain('module/constructors/src/box.cpp:21')
    expect(runtime.shell.requests).toContainEqual(expect.objectContaining({
      command: `git diff --unified=0 --no-ext-diff ${'a'.repeat(40)} --`,
      workdir: join(root, 'module', 'constructors'),
    }))
  })

  it('rejects an invalid forbidden symbol before Git execution', async () => {
    const root = await fixtureRoot()
    roots.push(root)
    const runtime = await mount(root)
    disposers.push(runtime.dispose)

    const result = await runtime.call('gme_delivery_check', { forbidden_symbol: 'api_box; exit' })

    expect(result.isError).toBe(true)
    expect(runtime.shell.requests).toHaveLength(0)
  })
})
