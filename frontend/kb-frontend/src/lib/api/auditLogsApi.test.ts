import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getAuditLogs } from './auditLogsApi'

describe('audit logs API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends filters, pagination, ordering, and bearer token to the read-only endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [], page: 2, pageSize: 25, totalCount: 0
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const controller = new AbortController()

    await getAuditLogs({
      articleId: 'article-id',
      userId: 'user-id',
      article: '  onboarding  ',
      user: '  reviewer@example.test  ',
      actionType: 'ArticlePublished',
      from: '2026-07-01T10:00:00.000Z',
      to: '2026-07-02T10:00:00.000Z',
      page: 2,
      pageSize: 25,
      sortDirection: 'asc'
    }, 'Bearer access-token', controller.signal)

    const [requestUrl, init] = fetchMock.mock.calls[0]
    const url = new URL(String(requestUrl))
    const headers = new Headers(init?.headers)

    expect(url.pathname).toBe('/api/audit-logs')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      pageSize: '25',
      sortDirection: 'asc',
      articleId: 'article-id',
      userId: 'user-id',
      article: 'onboarding',
      user: 'reviewer@example.test',
      actionType: 'ArticlePublished',
      from: '2026-07-01T10:00:00.000Z',
      to: '2026-07-02T10:00:00.000Z'
    })
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(init?.signal).toBe(controller.signal)
    expect(init?.method).toBeUndefined()
  })
})
