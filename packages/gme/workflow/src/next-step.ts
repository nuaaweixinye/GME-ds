/** Workflow signposts: map a backend job status to the next model action. */

/** One signpost embedded in every tool response. */
export interface SuggestedNext {
  phase: 'poll' | 'report' | 'decide' | 'done'
  tool: 'gme_check' | null
  arguments: Record<string, string | number> | null
  note: string
}

const EXECUTING = new Set([
  'queued', 'creating_worktree', 'running_agent', 'checking_format',
  'building', 'running_tests', 'running_memory_audit', 'applying_skips', 'creating_pr',
])

function poll(jobId: string | null, note: string): SuggestedNext {
  return {
    phase: 'poll', tool: 'gme_check',
    arguments: jobId === null ? null : { resource: 'job', job_id: jobId },
    note,
  }
}

/** Map one task status to the next model action; unknown statuses fall back to polling. */
export function suggestedNext(status: string | null, jobId: string | null): SuggestedNext {
  if (status !== null && EXECUTING.has(status)) {
    return poll(jobId, 'Task is executing; check again with gme_check in about 60 seconds.')
  }
  if (status === 'needs_review') return {
    phase: 'report', tool: null, arguments: null,
    note: 'Report the result summary, failures list and diff highlights to the user, then wait for their skip/fix/PR decision (gme_decide requires confirm).',
  }
  if (status === 'failed') return {
    phase: 'decide', tool: null, arguments: null,
    note: 'Show the error summary to the user and suggest retrying via gme_generate kind=retry after their confirmation.',
  }
  if (status === 'pr_created') return {
    phase: 'done', tool: null, arguments: null,
    note: 'The PR was created; report its URL and finish.',
  }
  if (status === 'worktree_cleaned') return {
    phase: 'done', tool: null, arguments: null,
    note: 'The worktree was cleaned; the flow is finished.',
  }
  return poll(jobId, `Unknown task status ${JSON.stringify(status)}; check again with gme_check.`)
}

/** Pick the signpost for a reply body: a jobs list targets its first executing entry. */
export function suggestedNextForReply(data: unknown, status: string | null, jobId: string | null): SuggestedNext {
  if (data !== null && typeof data === 'object' && Array.isArray((data as { jobs?: unknown }).jobs)) {
    const executing = ((data as { jobs: unknown[] }).jobs).find(
      (job): job is { id: string; status: string } =>
        typeof job === 'object' && job !== null
        && typeof (job as { id?: unknown }).id === 'string'
        && typeof (job as { status?: unknown }).status === 'string'
        && EXECUTING.has((job as { status: string }).status),
    )
    if (executing) return suggestedNext(executing.status, executing.id)
  }
  return suggestedNext(status, jobId)
}
