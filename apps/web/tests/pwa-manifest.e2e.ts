import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'GME Harness',
    short_name: 'GME',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/gme-logo.png',
      sizes: 'any',
      type: 'image/png',
      purpose: 'any',
    }],
  })
})

it('ships the GME favicon asset with the built web application', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'gme-logo.png'))
  expect(favicon.byteLength).toBeGreaterThan(0)
})
