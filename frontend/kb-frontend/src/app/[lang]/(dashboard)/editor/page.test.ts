import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import Page from './page'

vi.mock('@/lib/auth/serverAccessToken', () => ({ getServerAccessToken: vi.fn() }))

describe('editor route authentication', () => {
  beforeEach(() => vi.mocked(getServerAccessToken).mockReset())

  it('passes the authenticated session token to every editor API client', async () => {
    vi.mocked(getServerAccessToken).mockResolvedValue('authenticated-session-token')
    process.env.KB_DEV_ACCESS_TOKEN = 'different-development-token'

    const page = await Page({
      params: Promise.resolve({ lang: 'en' }),
      searchParams: Promise.resolve({ articleId: 'article-1' })
    })

    expect(page.props.accessToken).toBe('authenticated-session-token')
  })
})
