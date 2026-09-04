// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DocumentTitle } from '../src/client/DocumentTitle.tsx'

afterEach(() => {
  cleanup()
  document.title = ''
  vi.unstubAllEnvs()
})

describe('DocumentTitle', () => {
  it('projects a durable title and restores the product title', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'GME Harness')
    document.title = 'stale title'
    const mounted = render(<DocumentTitle productTitle="GME Harness" />)
    expect(document.title).toBe('GME Harness')
    mounted.rerender(<DocumentTitle title="First title" productTitle="GME Harness" />)
    expect(document.title).toBe('First title — GME Harness')
    mounted.rerender(<DocumentTitle title="Revised title" productTitle="GME Harness" />)
    expect(document.title).toBe('Revised title — GME Harness')
    mounted.rerender(<DocumentTitle productTitle="GME Harness" />)
    expect(document.title).toBe('GME Harness')
    mounted.unmount()
    expect(document.title).toBe('GME Harness')
  })

  it('uses the generic title when the build provides no title', () => {
    vi.stubEnv('DSH_CLIENT_TITLE', '')
    delete process.env.DSH_CLIENT_TITLE
    const mounted = render(<DocumentTitle title="First title" productTitle="GME Harness" />)
    expect(document.title).toBe('First title — GME Harness')
    mounted.unmount()
    expect(document.title).toBe('GME Harness')
  })
})
