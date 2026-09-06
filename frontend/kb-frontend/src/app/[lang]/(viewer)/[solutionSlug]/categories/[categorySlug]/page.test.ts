import { describe, expect, it, vi } from 'vitest'

import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerCategoryRoute from './page'

vi.mock('@/lib/auth/serverAccessToken', () => ({
  getInternalPreviewAccessToken: vi.fn()
}))

describe('ViewerCategoryRoute', () => {
  it('passes an in-scope category slug through the external Viewer flow', async () => {
    vi.mocked(getInternalPreviewAccessToken).mockResolvedValue('')
    const element = await ViewerCategoryRoute({
      params: Promise.resolve({ lang: 'ar', solutionSlug: 'swiftassess', categorySlug: 'getting-started' })
    })

    expect(element.props.solutionSlug).toBe('swiftassess')
    expect(element.props.categorySlug).toBe('getting-started')
    expect(element.props.preview).toBeUndefined()
    expect(element.props.activeLocale).toBe('ar')
  })

  it('retains internal preview authentication while navigating categories', async () => {
    vi.mocked(getInternalPreviewAccessToken).mockResolvedValue('internal.jwt')
    const element = await ViewerCategoryRoute({
      params: Promise.resolve({ lang: 'en', solutionSlug: 'root-category', categorySlug: 'child-category' })
    })

    expect(element.props.categorySlug).toBe('child-category')
    expect(element.props.preview).toEqual({ categorySlug: 'root-category', accessToken: 'internal.jwt' })
  })
})
