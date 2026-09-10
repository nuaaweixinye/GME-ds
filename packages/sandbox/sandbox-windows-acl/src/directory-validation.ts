import { statSync } from 'node:fs'

type StatDirectory = (path: string) => { isDirectory: () => boolean }

/** Return a runner-facing diagnostic when a required directory is unusable. */
export function directoryValidationError(
  label: string,
  path: string,
  stat: StatDirectory = statSync,
): string | undefined {
  try {
    if (!stat(path).isDirectory()) return `${label} is not an existing directory: ${path}`
    return undefined
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : undefined
    if (code === 'ENOENT') return `${label} is not an existing directory: ${path}`
    if (code === 'EACCES' || code === 'EPERM') return `${label} is not accessible (${code}): ${path}`
    return `${label} could not be inspected${code === undefined ? '' : ` (${code})`}: ${path}`
  }
}
