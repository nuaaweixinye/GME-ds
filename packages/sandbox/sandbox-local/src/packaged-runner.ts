/**
 * Packaged-runtime resolution for the Windows ACL runner sidecar. In the
 * single-file SEA runtime, `@deepseek-ai/dsh-sandbox-windows-acl` cannot be
 * spawned as `node lib/runner.js`; the build therefore ships a dedicated
 * native sidecar executable beside the runtime, and the packaged sandbox
 * provider resolves it from the runtime's own path instead of a module spec.
 * @module @deepseek-ai/dsh-sandbox-local/packaged-runner
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

/**
 * Resolve the Windows ACL runner sidecar adjacent to a packaged runtime
 * executable, or fail closed.
 * @param executable - the running packaged executable path (the runtime exe).
 * @returns the adjacent `-acl.exe` (or `-acl` on non-Windows) sidecar path.
 * @throws Error naming the ACL runner when the sidecar is absent.
 */
export function packagedWindowsAclRunner(executable: string): string {
  const runner = executable.endsWith('.exe')
    ? `${executable.slice(0, -'.exe'.length)}-acl.exe`
    : `${executable}-acl`
  if (!existsSync(runner)) {
    throw new Error(`sandbox-local: missing the packaged Windows ACL runner sidecar at ${runner}`)
  }
  return runner
}

/**
 * Detect a packaged single-file runtime process. Node SEA defines no
 * `process.isBundled` flag; its official marker is `node:sea`.isSea(), loaded
 * through createRequire so development carriers on Node without the module
 * keep working.
 * @returns true inside a single-executable (or otherwise bundled) runtime.
 */
export function isPackagedSingleFileRuntime(): boolean {
  if ((process as { isBundled?: boolean }).isBundled) return true
  try {
    const sea = createRequire(import.meta.url)('node:sea') as { isSea?: () => boolean }
    return typeof sea.isSea === 'function' && sea.isSea()
  } catch {
    return false
  }
}
