import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import { Backend, type BackendOptions } from '../src/backend.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

async function fixture(script?: string) {
  const root = await mkdtemp(join(tmpdir(), 'gme-worker-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'backend'))
  await writeFile(join(root, 'backend', 'run_backend.py'), script ?? `
import http.server, json, os, pathlib, sys
with pathlib.Path('started.txt').open('a', encoding='utf8', newline='') as log: log.write('started\\n')
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/exit': os._exit(1)
        if self.headers.get('Authorization') != 'Bearer ' + os.environ['GME_AGENT_API_TOKEN']:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{}')
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({'ok': True, 'authenticated': True}).encode())
    def log_message(self, *args): pass
http.server.HTTPServer(('127.0.0.1', int(sys.argv[sys.argv.index('--port')+1])), Handler).serve_forever()
`)
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('missing port')
  await new Promise<void>((resolve, reject) => listener.close((error) => { if (error) reject(error); else resolve() }))
  const ctx = new Context()
  await ctx.plugin(LocalSubprocess)
  cleanups.push(() => ctx.fiber.dispose())
  const options: BackendOptions = {
    backendRoot: root, pythonPath: process.env.GME_WORKFLOW_TEST_PYTHON ?? 'python3',
    configFile: 'config.local.json', tokenFile: 'logs/web-api-token.log', port: address.port,
    autoStart: true, timeoutMs: 1000, startupTimeoutMs: 3000, maxResponseBytes: 1024,
  }
  const backend = new Backend(ctx, options)
  cleanups.push(() => backend.close())
  return { backend, options, root }
}

describe('managed GME backend', () => {
  it('shares concurrent startup and terminates the owned process on disposal', async () => {
    const { backend, root, options } = await fixture()
    const results = await Promise.all(Array.from({ length: 3 }, () => backend.request('GET', '/api/health', undefined, new AbortController().signal)))
    expect(results.every(r => r.httpStatus === 200)).toBe(true)
    expect(await readFile(join(root, 'started.txt'), 'utf8')).toBe('started\n')
    expect((await readFile(join(root, options.tokenFile), 'utf8')).length).toBeGreaterThanOrEqual(32)
    await backend.close()
    await expect(fetch(`http://127.0.0.1:${options.port}/api/health`)).rejects.toThrow()
  })

  it('reports an early Python failure and releases the child', async () => {
    const { backend } = await fixture('raise RuntimeError("fixture startup failure")')
    await expect(backend.request('GET', '/api/health', undefined, new AbortController().signal)).rejects.toThrow('exited during startup')
  })

  it('starts a new owned backend on a subsequent query after a crash', async () => {
    const { backend, root } = await fixture()
    const signal = new AbortController().signal
    await backend.request('GET', '/api/health', undefined, signal)
    await expect(backend.request('GET', '/exit', undefined, signal)).rejects.toThrow()
    await expect.poll(async () => {
      try { return (await backend.request('GET', '/api/health', undefined, signal)).httpStatus }
      catch { return 0 }
    }, { timeout: 4000 }).toBe(200)
    expect(await readFile(join(root, 'started.txt'), 'utf8')).toBe('started\nstarted\n')
  })

  it('cancels a caller while the shared backend is still becoming ready', async () => {
    const { backend } = await fixture('import time\ntime.sleep(20)')
    const controller = new AbortController()
    const started = Date.now()
    const request = backend.request('GET', '/api/health', undefined, controller.signal)
    setTimeout(() =>{  controller.abort() }, 50)
    await expect(request).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(1500)
  })
})
