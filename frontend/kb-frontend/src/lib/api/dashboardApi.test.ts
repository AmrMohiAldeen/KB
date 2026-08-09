import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDashboardItems, reorderDashboardItem } from './dashboardApi'

describe('dashboard API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('loads and maps the combined positioned dashboard response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          kind: 'category',
          id: 'category-id',
          position: 1,
          category: {
            id: 'category-id',
            parentId: null,
            name: 'Guides',
            slug: 'guides',
            description: null,
            sortOrder: 1,
            path: '/guides/',
            depth: 0,
            articleCount: 2
          },
          article: null
        },
        {
          kind: 'article',
          id: 'article-id',
          position: 2,
          category: null,
          article: {
            articleId: 'article-id',
            title: 'Onboarding',
            slug: 'onboarding',
            status: 'Draft',
            category: null,
            owner: { userId: 'owner-id', fullName: 'Owner' },
            currentDraftId: 'draft-id',
            currentPublishedVersionId: null,
            createdAt: '2026-08-01T00:00:00Z',
            updatedAt: '2026-08-02T00:00:00Z',
            publishedAt: null,
            isCurrentDraftLocked: false,
            lockedBy: null,
            position: 2
          }
        }
      ],
      page: 1,
      pageSize: 100,
      totalCount: 2,
      articleCount: 1,
      everythingArticleCount: 4,
      filterCounts: {
        everything: 4,
        published: 1,
        draftUnpublished: 3,
        toReview: 1,
        archived: 2
      },
      truncated: false
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await getDashboardItems({
      accessToken: 'access-token',
      filter: 'DraftUnpublished',
      search: 'onboarding',
      categoryId: 'category-id',
      sort: 'position',
      page: 2,
      pageSize: 25
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/dashboard/items?filter=DraftUnpublished&sortBy=position&page=2&pageSize=25&search=onboarding&categoryId=category-id'
    )
    expect(result.items.map(item => item.id)).toEqual(['category:category-id', 'article:article-id'])
    expect(result.items[0]).toMatchObject({
      kind: 'category',
      category: { description: '', children: [] }
    })
    expect(result.articleCount).toBe(1)
    expect(result.everythingArticleCount).toBe(4)
    expect(result.filterCounts.Archived).toBe(2)
  })

  it('persists relative ordering through the group-specific endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    await reorderDashboardItem({
      accessToken: 'access-token',
      kind: 'article',
      id: 'article/id',
      targetId: 'target-id',
      placement: 'after'
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/dashboard/articles/article%2Fid/position'
    )
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ targetId: 'target-id', placement: 'after' })
    })
  })
})
