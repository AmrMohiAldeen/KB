import { describe, expect, it, vi } from 'vitest'

import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalRoute from './page'

vi.mock('@/lib/auth/serverAccessToken', () => ({
  getInternalPreviewAccessToken: vi.fn()
}))

describe('ViewerPortalRoute', () => {
  it('restores internal preview mode from the authenticated preview cookie on direct navigation or refresh', async () => {
    vi.mocked(getInternalPreviewAccessToken).mockResolvedValue('internal.jwt')

    const element = await ViewerPortalRoute({ params: Promise.resolve({ lang: 'fr', solutionSlug: 'synopsis' }) })

    expect(element.props.preview).toEqual({ categorySlug: 'synopsis', accessToken: 'internal.jwt' })
    expect(element.props.solutionSlug).toBeUndefined()
    expect(element.props.activeLocale).toBe('fr')
  })

  it('keeps ordinary viewer navigation on the external viewer-session flow', async () => {
    vi.mocked(getInternalPreviewAccessToken).mockResolvedValue('')

    const element = await ViewerPortalRoute({ params: Promise.resolve({ lang: 'en', solutionSlug: 'swiftassess' }) })

    expect(element.props.solutionSlug).toBe('swiftassess')
    expect(element.props.preview).toBeUndefined()
  })

  it('defers a clean route without a locale cookie to the backend configured default', async () => {
    vi.mocked(getInternalPreviewAccessToken).mockResolvedValue('')

    const element = await ViewerPortalRoute({
      params: Promise.resolve({ lang: 'en', solutionSlug: 'swiftassess' }),
      searchParams: Promise.resolve({ __viewerDefaultLocale: '1' })
    })

    expect(element.props.activeLocale).toBeUndefined()
  })
})
