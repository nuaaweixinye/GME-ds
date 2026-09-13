/** Read-only smoke of the built package against an explicitly configured local backend. */
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as Workflow from '../lib/index.js'

const backendRoot = process.env.GME_TEST_AGENT_ROOT
assert(backendRoot, 'Set GME_TEST_AGENT_ROOT to the existing backend checkout')
const ctx = new Context()
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(Workflow, { backendRoot, autoStart: false })
  for (const resource of ['catalogs', 'jobs']) {
    const result = await ctx.tools.execute({ name: 'gme_check', arguments: { resource }, callId: ToolCallId(`live-${resource}`), signal: new AbortController().signal })
    assert(!result.isError, JSON.stringify(result))
    const page = JSON.parse(result.content[0].text)
    assert.equal(page.accepted, false)
    assert(typeof page.suggested_next?.phase === 'string')
    process.stdout.write(`${resource}: OK (${page.total_characters} report characters)\n`)
  }
} finally { await ctx.fiber.dispose() }
