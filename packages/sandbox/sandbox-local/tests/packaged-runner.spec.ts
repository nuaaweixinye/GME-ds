import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { packagedWindowsAclRunner } from '../src/packaged-runner.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('requires the adjacent Windows ACL executable without falling back to the CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-packaged-acl-'))
  roots.push(root)
  const executable = join(root, 'deepseek-harness-sdk-runtime-win-x64.exe')
  expect(() => packagedWindowsAclRunner(executable)).toThrow('ACL runner')
  writeFileSync(join(root, 'unrelated-acl.exe'), '')
  expect(() => packagedWindowsAclRunner(executable)).toThrow('ACL runner')
  const runner = join(root, 'deepseek-harness-sdk-runtime-win-x64-acl.exe')
  writeFileSync(runner, '')
  expect(packagedWindowsAclRunner(executable)).toBe(runner)
})
