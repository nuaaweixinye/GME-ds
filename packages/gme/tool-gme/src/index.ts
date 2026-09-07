/** GME-ACIS project tools for DeepSeek Harness. */
import type { Context } from '@deepseek-ai/cordis'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import { buildGmeCommand, buildGtestCommand, validateBuildDirectory, validateGtestFilter, validateIdentifier } from './commands.ts'
import { inspectGmeProject, resolveGmeRoot, type GmeProjectStatus } from './project.ts'

export const name = 'tool-gme'
export const inject = ['tools', 'shell', 'systemPrompt']

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
