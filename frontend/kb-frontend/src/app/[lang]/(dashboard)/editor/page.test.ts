import { afterEach, describe, expect, it } from 'vitest'
import Page from './page'

describe('editor route authentication', () => {
  const originalAccessToken = process.env.KB_DEV_ACCESS_TOKEN

  afterEach(() => {
    if (originalAccessToken === undefined) delete process.env.KB_DEV_ACCESS_TOKEN
    else process.env.KB_DEV_ACCESS_TOKEN = originalAccessToken
  })

  it('passes the development JWT to every editor API client', async () => {
    process.env.KB_DEV_ACCESS_TOKEN = 'development-token'

    const page = await Page({
      params: Promise.resolve({ lang: 'en' }),
      searchParams: Promise.resolve({ articleId: 'article-1' })
    })

    expect(page.props.accessToken).toBe('development-token')
  })
})
