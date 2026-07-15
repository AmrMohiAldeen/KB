import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from './http'
import {
  deleteArticle,
  describeArticleApiError,
  getArticles,
  updateArticle
} from './articlesApi'

describe('articles API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends the backend list query contract and bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [], page: 2, pageSize: 25, totalCount: 0
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const controller = new AbortController()

    await getArticles({
      search: '  onboarding  ',
      categoryId: 'category-id',
      status: 'InReview',
      ownerId: 'owner-id',
      page: 2,
      pageSize: 25,
      sortBy: 'title',
      sortDirection: 'asc'
    }, 'access-token', controller.signal)

    const [url, init] = fetchMock.mock.calls[0]
    const headers = new Headers(init?.headers)

    expect(url).toBe('https://api.example.test/api/articles?page=2&pageSize=25&sortBy=title&sortDirection=asc&search=onboarding&categoryId=category-id&status=InReview&ownerId=owner-id')
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(init?.signal).toBe(controller.signal)
  })

  it('preserves the row-version token in metadata updates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ articleId: 'article-id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    await updateArticle('article-id', {
      title: 'Updated',
      categoryId: 'category-id',
      slug: 'updated',
      rowVersion: 'AQIDBA=='
    }, 'access-token')

    const [, init] = fetchMock.mock.calls[0]

    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual({
      title: 'Updated',
      categoryId: 'category-id',
      slug: 'updated',
      rowVersion: 'AQIDBA=='
    })
  })

  it('handles no-content deletes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await expect(deleteArticle('article-id', 'access-token')).resolves.toBeUndefined()
  })

  it('parses problem-details concurrency responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 409,
      title: 'Concurrency conflict',
      detail: 'The resource was changed by another request.'
    }), { status: 409, headers: { 'content-type': 'application/problem+json' } }))

    let error: unknown

    try {
      await updateArticle('article-id', {
        title: 'Updated',
        categoryId: 'category-id',
        slug: 'updated',
        rowVersion: 'stale'
      }, 'access-token')
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ApiError)
    expect(describeArticleApiError(error)).toEqual([
      'This article changed after it was loaded. Close and reopen the edit dialog to reload it before trying again.'
    ])
  })
})
