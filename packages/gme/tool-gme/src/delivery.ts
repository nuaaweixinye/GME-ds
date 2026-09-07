import { validateCppSymbol } from './indexer.ts'

/** One added production line that calls the forbidden symbol. */
export interface ForbiddenCallFinding {
  path: string
  line: number
  text: string
}

/** One submodule whose recorded commit or worktree differs from the superproject. */
export interface ChangedSubmodule {
  path: string
  status: 'missing' | 'divergent' | 'conflicted' | 'dirty'
}

function productionPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  return !normalized.startsWith('tests/')
    && !normalized.includes('/tests/')
    && !normalized.startsWith('demo/')
    && !normalized.startsWith('benchtests/')
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Inspect added production lines in a unified diff for one forbidden call.
 * @param diff - Unified Git diff text.
 * @param forbiddenSymbol - Validated C++ symbol that production additions must not call.
 * @param pathPrefix - Optional submodule path prepended before path classification.
 * @returns Deterministically ordered forbidden call findings.
 */
export function inspectDeliveryDiff(diff: string, forbiddenSymbol: string, pathPrefix = ''): ForbiddenCallFinding[] {
  validateCppSymbol(forbiddenSymbol)
  const call = new RegExp(`\\b${escapedRegExp(forbiddenSymbol)}\\s*\\(`)
  const findings: ForbiddenCallFinding[] = []
  let path: string | undefined
  let newLine = 0
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      const diffPath = line.slice('+++ b/'.length).replace(/\\/g, '/')
      path = pathPrefix === '' ? diffPath : `${pathPrefix.replace(/\/$/, '')}/${diffPath}`
      continue
    }
    if (line.startsWith('@@')) {
      const start = /\+(\d+)/.exec(line)?.[1]
      newLine = start === undefined ? 0 : Number(start)
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const text = line.slice(1).trim()
      if (path !== undefined && productionPath(path) && call.test(text)) {
        findings.push({ path, line: newLine, text })
      }
      newLine++
      continue
    }
    if (!line.startsWith('-') && !line.startsWith('diff ') && !line.startsWith('---')) newLine++
  }
  return findings
}

/**
 * Parse changed recursive submodules using Git's recorded and worktree state.
 * @param status - Output from `git submodule status --recursive`.
 * @param porcelain - Output from root `git status --porcelain=v1`.
 * @returns Changed submodules in Git output order.
 */
export function changedSubmodules(status: string, porcelain = ''): ChangedSubmodule[] {
  const dirtyPaths = porcelain.split(/\r?\n/)
    .filter(line => line.length >= 4 && line.slice(0, 2) !== '  ')
    .map(line => line.slice(3).split(' -> ').at(-1)?.replace(/\\/g, '/'))
    .filter(path => path !== '')
  const changes: ChangedSubmodule[] = []
  for (const line of status.split(/\r?\n/)) {
    const prefix = line[0]
    const path = line.slice(1).trim().split(/\s+/, 2)[1]
    if (path === undefined) continue
    const normalizedPath = path.replace(/\\/g, '/')
    const dirty = dirtyPaths.some(candidate => normalizedPath === candidate || normalizedPath.startsWith(`${candidate}/`))
    if (prefix !== '-' && prefix !== '+' && prefix !== 'U' && !dirty) continue
    changes.push({
      path: normalizedPath,
      status: prefix === '-' ? 'missing' : prefix === '+' ? 'divergent' : prefix === 'U' ? 'conflicted' : 'dirty',
    })
  }
  return changes
}
