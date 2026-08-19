import { afterEach, describe, expect, it, vi } from 'vitest'

import { openInternalPreview } from './openInternalPreview'

describe('openInternalPreview', () => {
  afterEach(() => vi.restoreAllMocks())

  it('posts the existing internal token to the same-origin activation route without putting it in the URL', () => {
    let submitted: HTMLFormElement | undefined
    vi.spyOn(document.body, 'append').mockImplementation((...nodes: (Node | string)[]) => {
      submitted = nodes[0] as HTMLFormElement
    })
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)

    expect(openInternalPreview('SwiftAssess', 'Bearer internal.jwt.value')).toBe(true)
    expect(submitted).toBeDefined()
    expect(submitted?.method).toBe('post')
    expect(submitted?.getAttribute('action')).toBe('/api/internal-preview')
    expect(submitted?.target).toBe('_blank')
    expect(submitted?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(new FormData(submitted!).get('categorySlug')).toBe('swiftassess')
    expect(new FormData(submitted!).get('accessToken')).toBe('internal.jwt.value')
    expect(submitted?.getAttribute('action')).not.toContain('internal.jwt.value')
  })

  it('does not attempt to activate preview without an authenticated dashboard token', () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)

    expect(openInternalPreview('swiftassess', '')).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })
})
