import { access } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'

export interface GmeSubmoduleSummary {
  total: number
  aligned: number
  missing: number
  divergent: number
  conflicted: number
}

export interface GmeProjectStatus {
  root: string
  branch: string
  dirty: boolean
  submodules: GmeSubmoduleSummary
  gitVersion: string
  cmakeVersion: string
}

export type GmeCommandRunner = (command: string) => Promise<ShellRunResult>

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function isGmeRoot(path: string): Promise<boolean> {
  return await exists(join(path, 'CMakeLists.txt'))
    && await exists(join(path, '.gitmodules'))
    && await exists(join(path, 'include', 'gme'))
}

/** Resolve the nearest GME-ACIS root from explicit, configured, or session paths. */
export async function resolveGmeRoot(
  explicitRoot: string | undefined,
  configuredRoot: string | undefined,
  sessionCwd: string | undefined,
): Promise<string> {
  const candidate = explicitRoot ?? configuredRoot ?? sessionCwd
  if (candidate === undefined || candidate.trim().length === 0) {
    throw new Error('GME project root is unavailable; set projectRoot or open a GME-ACIS workspace')
  }
  let current = resolve(candidate)
  while (true) {
    if (await isGmeRoot(current)) return current
    const parent = dirname(current)
    if (parent === current || explicitRoot !== undefined || configuredRoot !== undefined) break
    current = parent
  }
  throw new Error(`${resolve(candidate)} is not a GME-ACIS project`)
}

function successfulText(result: ShellRunResult, command: string): string {
  if (result.exitCode !== 0) {
    const detail = result.stderr.text.trim() || result.stdout.text.trim() || `exit ${String(result.exitCode)}`
    throw new Error(`${command} failed: ${detail}`)
  }
  return result.stdout.text.trim()
}

function parseBranch(status: string): string {
  const header = status.split(/\r?\n/, 1)[0] ?? ''
  const branch = header.replace(/^##\s*/, '').split('...', 1)[0]?.trim()
  return branch === '' || branch === undefined ? '(detached)' : branch
}

export function parseSubmodules(text: string): GmeSubmoduleSummary {
  const summary: GmeSubmoduleSummary = { total: 0, aligned: 0, missing: 0, divergent: 0, conflicted: 0 }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    summary.total++
    switch (line[0]) {
      case '-': summary.missing++; break
      case '+': summary.divergent++; break
      case 'U': summary.conflicted++; break
      default: summary.aligned++
    }
  }
  return summary
}

/** Inspect Git, submodule, and required tool state for a validated GME root. */
export async function inspectGmeProject(root: string, run: GmeCommandRunner): Promise<GmeProjectStatus> {
  const [gitStatusResult, submoduleResult, gitVersionResult, cmakeVersionResult] = await Promise.all([
    run('git status --porcelain=v1 --branch'),
    run('git submodule status --recursive'),
    run('git --version'),
    run('cmake --version'),
  ])
  const gitStatus = successfulText(gitStatusResult, 'git status')
  const submodules = successfulText(submoduleResult, 'git submodule status')
  return {
    root,
    branch: parseBranch(gitStatus),
    dirty: gitStatus.split(/\r?\n/).slice(1).some(line => line.trim().length > 0),
    submodules: parseSubmodules(submodules),
    gitVersion: successfulText(gitVersionResult, 'git --version'),
    cmakeVersion: successfulText(cmakeVersionResult, 'cmake --version').split(/\r?\n/, 1)[0] ?? '',
  }
}
