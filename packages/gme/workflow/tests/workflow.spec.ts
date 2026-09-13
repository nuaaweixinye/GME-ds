import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as Workflow from '../src/index.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!() })

async function setup(overrides: Partial<Workflow.Config> = {}, throughLoader = false) {
  const root = await mkdtemp(join(tmpdir(), 'gme-workflow-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'logs'))
  const token = 'test-gme-token-'.repeat(4)
  await writeFile(join(root, 'logs', 'web-api-token.log'), token)
  const requests: Array<{ method: string; url: string; body: unknown }> = []
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('{}'); return }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(typeof chunk === 'string' ? chunk : String(chunk)))
    const raw = Buffer.concat(chunks).toString()
    requests.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : undefined })
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/health') { res.end(JSON.stringify({ ok: true, authenticated: true })); return }
    if (req.url === '/api/failures/failure-1') { res.end(JSON.stringify({ id: 'failure-1', job_id: 'owning-job' })); return }
    if (req.url?.includes('broken')) { res.writeHead(409).end(JSON.stringify({ error: 'Job is already active' })); return }
    if (req.url?.includes('slow')) { return }
    if (req.url?.includes('large')) { res.end(JSON.stringify({ report: '中'.repeat(10000) })); return }
    res.statusCode = req.method === 'POST' ? 202 : 200
    res.end(JSON.stringify({ id: 'job-1', status: 'running_agent', metadata: { note: '正在生成测试' } }))
  }
  const server = createServer((req, res) => { void handle(req, res).catch(() => { res.writeHead(500).end('{}') }) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections()
    server.close((error) => { if (error) reject(error); else resolve() })
  }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing port')
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const config = { backendRoot: root, port: address.port, autoStart: false, ...overrides }
  let fiber
  if (throughLoader) {
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt], ['@deepseek-ai/dsh-tools', Tools], ['@deepseek-ai/dsh-gme-workflow', Workflow],
    ])
    ctx.loader.internal = { version: 'v2', async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`Unexpected Loader module ${specifier}`)
      return modules.get(specifier)
    } } as unknown as NonNullable<typeof ctx.loader.internal>
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, JSON.stringify([
      { name: '@deepseek-ai/dsh-system-prompt' }, { name: '@deepseek-ai/dsh-tools' }, { name: '@deepseek-ai/dsh-gme-workflow', config },
    ]))
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    fiber = ctx.fiber
  } else {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    fiber = await ctx.plugin(Workflow, config)
  }
  let sequence = 0
  const call = (name: string, args: unknown, signal = new AbortController().signal) => ctx.tools.execute({
    name, arguments: args, signal, callId: ToolCallId(`gme-test-${++sequence}`),
  })
  return { ctx, fiber, call, requests, token }
}

describe('GME workflow tools', () => {
  it('reports the owning job rather than the failure identifier', async () => {
    const { call } = await setup()
    const result = await call('gme_workflow_query', { resource: 'failure', failure_id: 'failure-1', job_id: 'irrelevant-job' })
    expect(result.isError).not.toBe(true)
    const block = result.content[0]
    if (block?.type !== 'text') throw new Error('missing result')
    expect(JSON.parse(block.text)).toMatchObject({ job_id: 'owning-job' })
  })
  it('loads named plugin exports through a real Cordis configuration', async () => {
    const { call, requests } = await setup({}, true)
    const result = await call('gme_workflow_query', { resource: 'jobs' })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result)).toContain('job-1')
    expect(requests.at(-1)?.url).toBe('/api/jobs')
  })
  it('submits selected interfaces and reports acceptance without claiming validation passed', async () => {
    const { call, requests } = await setup()
    const result = await call('gme_workflow_create', { kind: 'tests', module: 'laws', interface_ids: ['law-1'] })
    expect(result.isError).not.toBe(true)
    expect(requests.at(-1)).toEqual({ method: 'POST', url: '/api/jobs/test-generation', body: { module: 'laws', interface_ids: ['law-1'] } })
    expect(JSON.stringify(result)).toContain('running_agent')
    expect(JSON.stringify(result)).toContain('job-1')
  })

  it.each([
    ['gme_workflow_query', { resource: 'events', job_id: 'job-1', after: 42 }, 'GET', '/api/jobs/job-1/events?after=42', undefined],
    ['gme_workflow_query', { resource: 'catalog', module: 'base' }, 'GET', '/api/interface-catalogs/base', undefined],
    ['gme_workflow_create', { kind: 'fix', failure_ids: ['failure-1', 'failure-2'] }, 'POST', '/api/fix-jobs', { failure_ids: ['failure-1', 'failure-2'] }],
    ['gme_workflow_action', { action: 'memory_audit', job_id: 'job-1', filter: 'LawSuite.Boundary' }, 'POST', '/api/jobs/job-1/memory-audit', { gtest_filter: 'LawSuite.Boundary' }],
    ['gme_workflow_action', { action: 'extend', job_id: 'job-1', goal: '异常参数' }, 'POST', '/api/jobs/job-1/extend-tests', { api_name: '异常参数' }],
    ['gme_workflow_create', { kind: 'tests', module: 'laws', goal: 'law-1 的边界条件' }, 'POST', '/api/jobs/test-generation', { module: 'laws', api_name: 'law-1 的边界条件' }],
    ['gme_workflow_submit', { kind: 'selected_tests', job_id: 'job-1', tests: [{ file: 'src/base.cpp', suite: 'BaseSuite', name: 'Boundary' }] }, 'POST', '/api/jobs/job-1/selected-tests-pr', { tests: [{ file: 'src/base.cpp', suite: 'BaseSuite', name: 'Boundary' }] }],
  ])('routes %s through the existing API contract', async (name, args, method, url, body) => {
    const { call, requests } = await setup()
    const result = await call(name, args)
    expect(result.isError).not.toBe(true)
    expect(requests.at(-1)).toEqual({ method, url, body })
  })

  it('returns a backend conflict without retrying the mutation', async () => {
    const { call, requests, token } = await setup()
    const result = await call('gme_workflow_action', { action: 'build', job_id: 'broken' })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('already active')
    expect(JSON.stringify(result)).not.toContain(token)
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(1)
  })

  it('rejects missing selections and unsafe identifiers before submitting a job', async () => {
    const { call, requests } = await setup()
    for (const [name, args] of [
      ['gme_workflow_create', { kind: 'fix', failure_ids: [] }],
      ['gme_workflow_create', { kind: 'tests', module: 'laws', interface_ids: ['law-1'], goal: 'would be discarded' }],
      ['gme_workflow_action', { action: 'build', job_id: '../config' }],
      ['gme_workflow_submit', { kind: 'selected_tests', job_id: 'job-1', tests: [] }],
    ] as const) expect((await call(name, args)).isError).toBe(true)
    expect(requests.filter(r => r.method === 'POST')).toHaveLength(0)
  })

  it('pages large reports and rejects oversized HTTP bodies', async () => {
    const { call } = await setup({ pageChars: 1000 })
    const first = await call('gme_workflow_query', { resource: 'artifacts', job_id: 'large' })
    expect(first.isError).not.toBe(true)
    const block = first.content[0]
    if (block?.type !== 'text') throw new Error('missing result')
    const value = JSON.parse(block.text) as { next_offset: number; content: string }
    expect(value.next_offset).toBe(1000)
    expect(value.content.length).toBe(1000)
    const second = await call('gme_workflow_query', { resource: 'artifacts', job_id: 'large', offset: value.next_offset })
    expect(second.isError).not.toBe(true)
    const limited = await setup({ maxResponseBytes: 1024 })
    expect((await limited.call('gme_workflow_query', { resource: 'artifacts', job_id: 'large' })).isError).toBe(true)
  })

  it('honors a query timeout and abort without replaying operations', async () => {
    const { call } = await setup({ timeoutMs: 40 })
    expect((await call('gme_workflow_query', { resource: 'job', job_id: 'slow' })).isError).toBe(true)
    const controller = new AbortController()
    controller.abort()
    expect((await call('gme_workflow_query', { resource: 'jobs' }, controller.signal)).isError).toBe(true)
  })

  it('unregisters its tools on disposal and leaves a reused backend available', async () => {
    const { call, fiber, requests } = await setup()
    await call('gme_workflow_query', { resource: 'health' })
    await fiber.dispose()
    expect((await call('gme_workflow_query', { resource: 'health' })).isError).toBe(true)
    expect(requests.length).toBeGreaterThan(0)
  })
})
