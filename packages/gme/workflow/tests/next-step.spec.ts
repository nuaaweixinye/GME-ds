import { describe, expect, it } from 'vitest'
import { suggestedNext, suggestedNextForReply } from '../src/next-step.ts'

describe('suggestedNext', () => {
  it.each(['queued', 'creating_worktree', 'running_agent', 'checking_format', 'building', 'running_tests', 'running_memory_audit', 'applying_skips', 'creating_pr'])(
    'maps the executing status %s to a gme_check poll signpost',
    (status) => {
      const next = suggestedNext(status, 'job-1')
      expect(next.phase).toBe('poll')
      expect(next.tool).toBe('gme_check')
      expect(next.arguments).toEqual({ resource: 'job', job_id: 'job-1' })
      expect(next.note).toMatch(/60 seconds/)
    },
  )
  it('keeps polling when the job id is unknown', () => {
    expect(suggestedNext('running_agent', null).arguments).toBeNull()
  })
  it('maps needs_review to a user report pause', () => {
    const next = suggestedNext('needs_review', 'job-1')
    expect(next).toMatchObject({ phase: 'report', tool: null, arguments: null })
    expect(next.note).toMatch(/failures/)
  })
  it('maps failed to a retry decision', () => {
    const next = suggestedNext('failed', 'job-1')
    expect(next.phase).toBe('decide')
    expect(next.note).toMatch(/retry/)
  })
  it.each(['pr_created', 'worktree_cleaned'])('maps %s to done', (status) => {
    expect(suggestedNext(status, 'job-1').phase).toBe('done')
  })
  it('falls back to poll with the status named for unknown states', () => {
    const next = suggestedNext('warp_speed', 'job-1')
    expect(next.phase).toBe('poll')
    expect(next.note).toContain('warp_speed')
  })
})

describe('suggestedNextForReply', () => {
  it('targets the first executing job from a jobs list reply', () => {
    const next = suggestedNextForReply(
      { jobs: [{ id: 'a', status: 'needs_review' }, { id: 'b', status: 'running_agent' }] },
      null, null,
    )
    expect(next.arguments).toEqual({ resource: 'job', job_id: 'b' })
  })
  it('falls back to the scalar status when the reply is not a jobs list', () => {
    expect(suggestedNextForReply({ id: 'job-1', status: 'failed' }, 'failed', 'job-1').phase).toBe('decide')
  })
})
