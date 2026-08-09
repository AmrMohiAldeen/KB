import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getArticleNotificationPreference,
  notificationsApi,
  setArticleNotificationPreference
} from './notificationsApi'

describe('notifications API', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test'))
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('uses authenticated current-user notification endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      const body = url.endsWith('unread-count') ? { unreadCount: 3 }
        : url.endsWith('read-all') ? { markedReadCount: 3, unreadCount: 0 }
          : url.endsWith('/read') ? { notificationId: 'n1', isRead: true }
            : { items: [], page: 2, pageSize: 10, totalCount: 0 }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await notificationsApi.list(2, 10, 'token')
    await notificationsApi.unreadCount('token')
    await notificationsApi.markRead('n1', 'token')
    await notificationsApi.markAllRead('token')

    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://api.example.test/api/notifications?page=2&pageSize=10',
      'https://api.example.test/api/notifications/unread-count',
      'https://api.example.test/api/notifications/n1/read',
      'https://api.example.test/api/notifications/read-all'
    ])
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PATCH')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('reads and updates a user preference for one article', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      articleId: 'article-1', enabled: false
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await getArticleNotificationPreference('article-1', 'token')
    await setArticleNotificationPreference('article-1', false, 'token')

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/api/notifications/articles/article-1/preference'
    )
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT')
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe('{"enabled":false}')
  })
})
