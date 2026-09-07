/** GME-ACIS project tools for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { buildGmeCommand, buildGtestCommand, validateBuildDirectory, validateGtestFilter, validateIdentifier } from './commands.ts'
import { locateGmeApi, validateCppSymbol, type GmeApiLocation } from './indexer.ts'
import { changedSubmodules, inspectDeliveryDiff, type ChangedSubmodule, type ForbiddenCallFinding } from './delivery.ts'
import { inspectGmeProject, resolveGmeRoot, type GmeProjectStatus } from './project.ts'

export const name = 'tool-gme'
export const inject = ['tools', 'shell', 'systemPrompt']

/** GME tool plugin configuration. */
export interface Config {
  /** Fixed GME-ACIS root. When omitted, tools resolve from the calling session cwd. */
  projectRoot?: string
  /** Maximum foreground command duration in milliseconds. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  projectRoot: z.string(),
  timeoutMs: z.number().min(1).default(600_000),
})

interface CommandOutput {
  command: string
  root: string
  exitCode: number | null
  timedOut: boolean
  stdout: string
  stderr: string
}

function commandOutput(command: string, root: string, result: ShellRunResult): CommandOutput {
  return {
    command,
    root,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: result.stdout.text,
    stderr: result.stderr.text,
  }
}

function renderCommand(output: CommandOutput): string {
  const body = output.stdout.trim() || output.stderr.trim() || '(no output)'
  return `Command: ${output.command}\nRoot: ${output.root}\nExit code: ${String(output.exitCode)}\n\n${body}`
}

function renderStatus(status: GmeProjectStatus): string {
  const submodules = status.submodules
  return [
    `GME root: ${status.root}`,
    `Branch: ${status.branch}`,
    `Working tree: ${status.dirty ? 'dirty' : 'clean'}`,
    `Submodules: ${submodules.total} total, ${submodules.aligned} aligned, ${submodules.missing} missing, ${submodules.divergent} divergent, ${submodules.conflicted} conflicted`,
    `Git: ${status.gitVersion}`,
    `CMake: ${status.cmakeVersion}`,
  ].join('\n')
}

function renderApiLocation(location: GmeApiLocation): string {
  const list = (values: string[]) => values.length === 0 ? '(none)' : values.join(', ')
  const lines = [
    `Symbol: ${location.symbol}`,
    `Module: ${location.module ?? '(unknown)'}`,
    `Direct dependencies: ${list(location.directDependencies)}`,
    `Transitive dependencies: ${list(location.transitiveDependencies)}`,
    `Affected dependants: ${list(location.affectedDependants)}`,
    '',
  ]
  if (location.matches.length === 0) lines.push('No current-checkout matches found.')
  for (const match of location.matches) {
    const label = match.kind[0]?.toUpperCase() + match.kind.slice(1)
    lines.push(`${label}: ${match.path}:${match.line}\n  ${match.text}`)
  }
  if (location.truncated) lines.push('', 'Results truncated; narrow the symbol or inspect with rg.')
  return lines.join('\n')
}

interface GmeDeliveryReport {
  root: string
  forbiddenSymbol: string
  changedSubmodules: ChangedSubmodule[]
  forbiddenCalls: ForbiddenCallFinding[]
}

function renderDeliveryReport(report: GmeDeliveryReport): string {
  const modules = report.changedSubmodules.length === 0
    ? '(none)'
    : report.changedSubmodules.map(module => `${module.path} (${module.status})`).join(', ')
  const lines = [
    `GME root: ${report.root}`,
    `Changed submodules: ${modules}`,
    `Forbidden symbol: ${report.forbiddenSymbol}`,
    `Forbidden production calls: ${report.forbiddenCalls.length}`,
  ]
  for (const finding of report.forbiddenCalls) lines.push(`${finding.path}:${finding.line}\n  ${finding.text}`)
  return lines.join('\n')
}

const COMMAND_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    command: { type: 'string', required: true },
    root: { type: 'string', required: true },
    exitCode: { required: true, oneOf: [{ type: 'integer' }, { type: 'null' }] },
    timedOut: { type: 'boolean', required: true },
    stdout: { type: 'string', required: true },
    stderr: { type: 'string', required: true },
  },
} as const

export function apply(ctx: Context, config: Config = {}): void {
  const timeoutMs = config.timeoutMs ?? 600_000
  const rootFor = (root: string | undefined, sessionCwd: string | undefined) =>
    resolveGmeRoot(root, config.projectRoot, sessionCwd)
  const run = (root: string, command: string, signal: AbortSignal) => ctx.shell.run(ctx.shell.resolve({
    command,
    workdir: root,
    timeoutMs,
    stdoutMaxBytes: 256_000,
    signal,
  }))

  ctx.systemPrompt.section({
    name: 'project:gme',
    order: 140,
    text: 'When working in GME-ACIS, treat it as a Git superproject whose modules and tests are separate submodules. Inspect submodule state before editing. Keep changes in the owning module and tests/gme, match observed ACIS behavior without calling the corresponding ACIS API from production code, run the narrow explicit GoogleTest filter before broader dependent-module tests, and commit submodule changes before updating the superproject gitlink.',
  })

  ctx.tools.register(defineTool({
    name: 'gme_project_status',
    description: 'Inspect a GME-ACIS superproject before making changes. Reports branch, cleanliness, recursive submodule state, Git, and CMake.',
    parameters: {
      root: { type: 'string', description: 'Optional absolute GME-ACIS root. Defaults to configured root or session workspace.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          dirty: { type: 'boolean', required: true },
          submodules: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              total: { type: 'integer', required: true }, aligned: { type: 'integer', required: true },
              missing: { type: 'integer', required: true }, divergent: { type: 'integer', required: true },
              conflicted: { type: 'integer', required: true },
            },
          },
          gitVersion: { type: 'string', required: true },
          cmakeVersion: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderStatus(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const root = await rootFor(args.root, exec.agent?.session.header.cwd)
      return inspectGmeProject(root, command => run(root, command, exec.signal))
    },
    presentCall: () => ({ card: 'generic', title: 'Inspect GME project', kind: 'search' }),
  }))

  ctx.tools.register(defineTool({
    name: 'gme_delivery_check',
    description: 'Check changed GME submodules and added production lines for direct calls to one forbidden ACIS symbol before delivery.',
    parameters: {
      root: { type: 'string', description: 'Optional absolute GME-ACIS root.' },
      forbidden_symbol: { type: 'string', required: true, description: 'Corresponding ACIS C++ symbol that production changes must not call.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          forbiddenSymbol: { type: 'string', required: true },
          changedSubmodules: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['missing', 'divergent', 'conflicted', 'dirty'] },
              },
            },
          },
          forbiddenCalls: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                line: { type: 'integer', required: true },
                text: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderDeliveryReport(value) }],
      presentationMeta: (_args, value) => ({
        changedSubmoduleCount: value.changedSubmodules.length,
        forbiddenCallCount: value.forbiddenCalls.length,
      }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      validateCppSymbol(args.forbidden_symbol)
      const root = await rootFor(args.root, exec.agent?.session.header.cwd)
      const [statusResult, submoduleResult, diffResult] = await Promise.all([
        run(root, 'git status --porcelain=v1', exec.signal),
        run(root, 'git submodule status --recursive', exec.signal),
        run(root, 'git diff --unified=0 --no-ext-diff HEAD', exec.signal),
      ])
      if (statusResult.exitCode !== 0) throw new Error(`git status failed: ${statusResult.stderr.text.trim()}`)
      if (submoduleResult.exitCode !== 0) throw new Error(`git submodule status failed: ${submoduleResult.stderr.text.trim()}`)
      if (diffResult.exitCode !== 0) throw new Error(`git diff failed: ${diffResult.stderr.text.trim()}`)
      const modules = changedSubmodules(submoduleResult.stdout.text, statusResult.stdout.text)
      const forbiddenCalls = inspectDeliveryDiff(diffResult.stdout.text, args.forbidden_symbol)
      for (const module of modules) {
        if (module.status === 'missing' || !/^[A-Za-z0-9._/-]+$/.test(module.path)) continue
        const baseResult = await run(root, `git rev-parse HEAD:${module.path}`, exec.signal)
        const base = baseResult.stdout.text.trim()
        if (baseResult.exitCode !== 0 || !/^[0-9a-f]{40,64}$/i.test(base)) {
          throw new Error(`Cannot resolve recorded commit for submodule ${module.path}: ${baseResult.stderr.text.trim()}`)
        }
        const moduleResult = await run(join(root, ...module.path.split('/')), `git diff --unified=0 --no-ext-diff ${base} --`, exec.signal)
        if (moduleResult.exitCode !== 0) throw new Error(`git diff failed in ${module.path}: ${moduleResult.stderr.text.trim()}`)
        forbiddenCalls.push(...inspectDeliveryDiff(moduleResult.stdout.text, args.forbidden_symbol, module.path))
      }
      return {
        root,
        forbiddenSymbol: args.forbidden_symbol,
        changedSubmodules: modules,
        forbiddenCalls,
      }
    },
    presentCall: args => ({ card: 'generic', title: `Check GME delivery: ${args.forbidden_symbol}`, kind: 'search' }),
  }))

  ctx.tools.register(defineTool({
    name: 'gme_locate_api',
    description: 'Locate a GME or ACIS C++ symbol in the current checkout and report declarations, implementations, tests, module dependencies, and affected dependants.',
    parameters: {
      root: { type: 'string', description: 'Optional absolute GME-ACIS root.' },
      symbol: { type: 'string', required: true, description: 'C++ identifier to locate, for example gme_api_make_box.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          symbol: { type: 'string', required: true },
          module: { type: 'string' },
          directDependencies: { type: 'array', required: true, items: { type: 'string' } },
          transitiveDependencies: { type: 'array', required: true, items: { type: 'string' } },
          affectedDependants: { type: 'array', required: true, items: { type: 'string' } },
          matches: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                line: { type: 'integer', required: true },
                text: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['declaration', 'implementation', 'test'] },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderApiLocation(value) }],
      presentationMeta: (_args, value) => ({ resultCount: value.matches.length, truncated: value.truncated }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      validateCppSymbol(args.symbol)
      const root = await rootFor(args.root, exec.agent?.session.header.cwd)
      return locateGmeApi(root, args.symbol, command => run(root, command, exec.signal))
    },
    presentCall: args => ({ card: 'generic', title: args.symbol, kind: 'search', rawInput: args.symbol }),
  }))

  ctx.tools.register(defineTool({
    name: 'gme_build',
    description: 'Configure and build a validated GME-ACIS all-module or single-development-module target.',
    parameters: {
      root: { type: 'string', description: 'Optional absolute GME-ACIS root.' },
      scope: { type: 'string', required: true, enum: ['all', 'module'] },
      module: { type: 'string', description: 'Module name required for module scope, for example constructors.' },
      configuration: { type: 'string', enum: ['Debug', 'Release', 'RelWithDebInfo'], description: 'Build configuration. Defaults to Debug.' },
      target: { type: 'string', description: 'CMake target. Defaults to tests.' },
      build_directory: { type: 'string', description: 'Relative build directory. Defaults to build.' },
      configure: { type: 'boolean', description: 'Run CMake configure before build. Defaults to true.' },
    },
    output: { schema: COMMAND_OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: renderCommand(value) }] },
    async execute(args, exec) {
      const root = await rootFor(args.root, exec.agent?.session.header.cwd)
      const target = args.target ?? 'tests'
      const buildDirectory = args.build_directory ?? 'build'
      validateIdentifier(target, 'target')
      validateBuildDirectory(buildDirectory)
      if (args.scope === 'module') {
        if (args.module === undefined) throw new Error('module is required when scope is module')
        validateIdentifier(args.module, 'module')
      }
      const command = buildGmeCommand({
        buildDirectory,
        configuration: args.configuration ?? 'Debug',
        target,
        configure: args.configure ?? true,
        scope: args.scope,
        ...args.module !== undefined ? { module: args.module } : {},
      }, process.platform)
      return commandOutput(command, root, await run(root, command, exec.signal))
    },
    presentCall: args => ({
      card: 'terminal',
      title: `Build GME ${args.target ?? 'tests'}`,
      ...args.root !== undefined ? { cwd: args.root } : {},
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'gme_test',
    description: 'Run an explicit GoogleTest filter from an existing GME-ACIS build.',
    parameters: {
      root: { type: 'string', description: 'Optional absolute GME-ACIS root.' },
      filter: { type: 'string', required: true, description: 'Explicit GoogleTest filter.' },
      configuration: { type: 'string', enum: ['Debug', 'Release', 'RelWithDebInfo'], description: 'Build configuration. Defaults to Debug.' },
      build_directory: { type: 'string', description: 'Relative build directory. Defaults to build.' },
      repeat: { type: 'integer', description: 'Repeat count from 1 to 100. Defaults to 1.' },
    },
    output: { schema: COMMAND_OUTPUT_SCHEMA, render: (_args, value) => [{ type: 'text', text: renderCommand(value) }] },
    async execute(args, exec) {
      const root = await rootFor(args.root, exec.agent?.session.header.cwd)
      const buildDirectory = args.build_directory ?? 'build'
      validateBuildDirectory(buildDirectory)
      validateGtestFilter(args.filter)
      const command = buildGtestCommand({
        buildDirectory,
        configuration: args.configuration ?? 'Debug',
        filter: args.filter,
        repeat: args.repeat ?? 1,
      }, process.platform)
      return commandOutput(command, root, await run(root, command, exec.signal))
    },
    presentCall: args => ({
      card: 'terminal',
      title: `Test GME ${args.filter}`,
      ...args.root !== undefined ? { cwd: args.root } : {},
    }),
  }))
}
