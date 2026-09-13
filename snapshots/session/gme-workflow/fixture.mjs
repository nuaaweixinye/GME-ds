/** Real workflow plugin against a deterministic authenticated HTTP backend. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Workflow from '@deepseek-ai/dsh-gme-workflow'
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

export const name = 'gme-workflow-fixture'
export const inject = ['tools', 'systemPrompt']

/** Mount the production tool with a fixture-owned backend and token file. @param ctx - Loader context. */
export async function apply(ctx) {
  const root = await mkdtemp(join(tmpdir(), 'gme-snapshot-'))
  ctx.effect(() => () => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'logs'))
  const token = 'gme-snapshot-token-'.repeat(4)
  await writeFile(join(root, 'logs', 'web-api-token.log'), token)
  let port
  await applyLoopbackServerEffect(ctx, {
    label: 'GME workflow backend', onCleanup() {},
    onListening(address) { port = address.port },
    requestListener(req, res) {
      res.setHeader('content-type', 'application/json')
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return }
      if (req.method === 'GET' && req.url === '/api/jobs') {
        res.end(JSON.stringify({ jobs: [{ id: 'job-1', status: 'running_agent' }] }))
        return
      }
      if (req.method !== 'GET' || req.url !== '/api/health') { res.writeHead(404).end('{}'); return }
      res.end(JSON.stringify({ ok: true, authenticated: true }))
    },
  })
  await ctx.plugin(Workflow, { backendRoot: root, port, autoStart: false })
}
