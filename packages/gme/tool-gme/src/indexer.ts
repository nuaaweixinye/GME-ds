import { readFile } from 'node:fs/promises'
import type { ShellRunResult } from '@deepseek-ai/dsh-shell'

export interface ModuleGraph {
  direct(module: string): string[]
  transitive(module: string): string[]
  dependants(module: string): string[]
}

export interface GmeApiMatch {
  path: string
  line: number
  text: string
  kind: 'declaration' | 'implementation' | 'test'
}

export interface GmeApiLocation {
  symbol: string
  module?: string
  directDependencies: string[]
  transitiveDependencies: string[]
  affectedDependants: string[]
  matches: GmeApiMatch[]
  truncated: boolean
}

export type IndexCommandRunner = (command: string) => Promise<ShellRunResult>

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

/** Parse the root CMake module dependency declarations into queryable graph views. */
export function parseModuleDependencies(cmakeText: string): ModuleGraph {
  const edges = new Map<string, string[]>()
  const declarations = /set\(\s*([A-Z][A-Z0-9_]*)_DEPS\s*([\s\S]*?)\)/g
  for (const match of cmakeText.matchAll(declarations)) {
    const module = match[1]?.toLowerCase()
    if (module === undefined) continue
    const body = (match[2] ?? '').replace(/#[^\r\n]*/g, '')
    const dependencies: string[] = []
    for (const token of body.matchAll(/"([A-Za-z][A-Za-z0-9_-]*)"|\b([A-Za-z][A-Za-z0-9_-]*)\b/g)) {
      const value = token[1] ?? token[2]
      if (value !== undefined) dependencies.push(value.toLowerCase())
    }
    edges.set(module, sorted(dependencies))
  }

  const transitive = (module: string): string[] => {
    const origin = module.toLowerCase()
    const found = new Set<string>()
    const active = new Set<string>()
    const visit = (current: string): void => {
      if (active.has(current)) throw new Error(`cyclic GME module dependency at ${current}`)
      active.add(current)
      for (const dependency of edges.get(current) ?? []) {
        if (!found.has(dependency)) {
          found.add(dependency)
          visit(dependency)
        }
      }
      active.delete(current)
    }
    visit(origin)
    found.delete(origin)
    return sorted(found)
  }

  return {
    direct: module => [...(edges.get(module.toLowerCase()) ?? [])],
    transitive,
    dependants: module => sorted(
      [...edges.keys()].filter(candidate => candidate !== module.toLowerCase() && transitive(candidate).includes(module.toLowerCase())),
    ),
  }
}

export function validateCppSymbol(symbol: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_:~]*$/.test(symbol)) {
    throw new Error('symbol must be a C++ identifier, optionally namespace-qualified')
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function matchKind(path: string): GmeApiMatch['kind'] {
  const normalized = normalizePath(path).toLowerCase()
  if (normalized.includes('/tests/') || normalized.startsWith('tests/') || normalized.includes('_test.')) return 'test'
  if (/\.(?:h|hh|hpp|hxx)$/.test(normalized) || normalized.startsWith('include/')) return 'declaration'
  return 'implementation'
}

function parseSearchMatches(text: string): GmeApiMatch[] {
  const matches: GmeApiMatch[] = []
  for (const record of text.split(/\r?\n/)) {
    const parsed = /^(.*?):(\d+):(.*)$/.exec(record)
    if (parsed === null) continue
    const path = normalizePath(parsed[1] ?? '')
    matches.push({
      path,
      line: Number(parsed[2]),
      text: (parsed[3] ?? '').trim(),
      kind: matchKind(path),
    })
  }
  return matches
}

function moduleFromPath(path: string): string | undefined {
  const normalized = normalizePath(path)
  return /^(?:module|include\/gme|tests\/gme\/(?:src|include\/tests))\/([^/]+)/.exec(normalized)?.[1]
}

/** Locate one symbol in the current checkout and derive its module impact. */
export async function locateGmeApi(
  root: string,
  symbol: string,
  run: IndexCommandRunner,
  maxMatches = 100,
): Promise<GmeApiLocation> {
  validateCppSymbol(symbol)
  const cmakeText = await readFile(`${root}/CMakeLists.txt`, 'utf8')
  const graph = parseModuleDependencies(cmakeText)
  const command = 'rg --fixed-strings --line-number --no-heading --color never '
    + '--glob "*.c" --glob "*.cc" --glob "*.cpp" --glob "*.cxx" '
    + '--glob "*.h" --glob "*.hh" --glob "*.hpp" --glob "*.hxx" '
    + `-- "${symbol}" include module tests demo`
  const result = await run(command)
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new Error(`GME symbol search failed: ${result.stderr.text.trim() || `exit ${String(result.exitCode)}`}`)
  }
  const allMatches = result.exitCode === 1 ? [] : parseSearchMatches(result.stdout.text)
  const matches = allMatches.slice(0, maxMatches)
  const module = matches.map(match => moduleFromPath(match.path)).find(value => value !== undefined)
  return {
    symbol,
    ...module !== undefined ? { module } : {},
    directDependencies: module === undefined ? [] : graph.direct(module),
    transitiveDependencies: module === undefined ? [] : graph.transitive(module),
    affectedDependants: module === undefined ? [] : graph.dependants(module),
    matches,
    truncated: allMatches.length > maxMatches || result.stdout.truncated,
  }
}
