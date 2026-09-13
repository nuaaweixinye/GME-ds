/** One real gme_workflow_create round through the plugin tool against a live backend. */
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as Workflow from '../lib/index.js'

const backendRoot = process.env.GME_TEST_AGENT_ROOT
const interfaceId = process.env.GME_INTERFACE_ID
const module = process.env.GME_MODULE ?? 'laws'
assert(backendRoot, 'Set GME_TEST_AGENT_ROOT to the existing backend checkout')
assert(interfaceId, 'Set GME_INTERFACE_ID to one catalog interface id')
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(Workflow, { backendRoot, autoStart: false })
  const result = await ctx.tools.execute({
    name: 'gme_workflow_create',
    arguments: { kind: 'tests', module, interface_ids: [interfaceId] },
    callId: ToolCallId('create-smoke'),
    signal: new AbortController().signal,
  })
  assert(!result.isError, result.content[0].text)
  const page = JSON.parse(result.content[0].text)
  assert(page.accepted, result.content[0].text)
  process.stdout.write(`created job ${page.job_id} status=${page.status}\n`)
} finally { await ctx.fiber.dispose() }
