import { describe, expect, it } from 'vitest'

import { directoryValidationError } from '../src/directory-validation.ts'

describe('directoryValidationError', () => {
  it('reports a missing directory separately from an inaccessible directory', () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' })

    expect(directoryValidationError('--temp', 'C:\\missing', () => { throw missing }))
      .toBe('--temp is not an existing directory: C:\\missing')
    expect(directoryValidationError('--temp', 'C:\\denied', () => { throw denied }))
      .toBe('--temp is not accessible (EPERM): C:\\denied')
  })

  it('reports an existing non-directory with the established validation message', () => {
    expect(directoryValidationError('--temp', 'C:\\file', () => ({ isDirectory: () => false })))
      .toBe('--temp is not an existing directory: C:\\file')
  })
})
