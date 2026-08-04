import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NotificationsApi } from '@/lib/api/notificationsApi'
import { ApiError } from '@/lib/api/http'
import type { NotificationResponse } from '@/types/apps/notificationTypes'
import NotificationsPage from './NotificationsPage'

vi.mock('next/navigation', () => ({ useParams: () => ({ lang: 'en' }) }))

const notification = (overrides: Partial<NotificationResponse> = {}): NotificationResponse => ({
  notificationId: 'notification-1',
  articleId: 'article-1',
  type: 'ArticleSubmittedForReview',
  title: 'Article ready for review',
  message: '“Guide” was submitted for review.',
  isRead: false,
  createdAt: '2026-08-03T08:00:00Z',
  readAt: null,
  ...overrides
})

const createApi = (overrides: Partial<NotificationsApi> = {}): NotificationsApi => ({
  list: vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 20, totalCount: 0 }),
  unreadCount: vi.fn().mockResolvedValue({ unreadCount: 0 }),
  markRead: vi.fn().mockImplementation(async id => notification({ notificationId: id, isRead: true,
    readAt: '2026-08-03T09:00:00Z' })),
  markAllRead: vi.fn().mockResolvedValue({ markedReadCount: 1, unreadCount: 0 }),
  ...overrides
})

describe('NotificationsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => act(() => root.unmount()))

  const settle = async () => act(async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0))
    await Promise.resolve()
  })

  const renderPage = async (api: NotificationsApi) => {
    await act(async () => root.render(createElement(NotificationsPage, { accessToken: 'token', api })))
    await settle()
  }

  const clickButton = async (label: string) => {
    const button = Array.from(document.querySelectorAll('button'))
      .find(value => value.textContent?.trim() === label)
    expect(button).toBeDefined()
    await act(async () => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    await settle()
  }

  it('renders unread and read rows and marks one notification as read', async () => {
    const unread = notification()
    const read = notification({ notificationId: 'notification-2', title: 'Article published',
      type: 'ArticlePublished', isRead: true, readAt: '2026-08-03T08:30:00Z' })
    const markRead = vi.fn().mockResolvedValue({ ...unread, isRead: true, readAt: '2026-08-03T09:00:00Z' })
    const api = createApi({
      list: vi.fn().mockResolvedValue({ items: [unread, read], page: 1, pageSize: 20, totalCount: 2 }),
      unreadCount: vi.fn().mockResolvedValue({ unreadCount: 1 }),
      markRead
    })

    await renderPage(api)

    expect(document.querySelector('[aria-label^="Unread notification"]')).not.toBeNull()
    expect(document.querySelector('[aria-label^="Read notification"]')).not.toBeNull()
    expect(document.body.textContent).toContain('1 unread')
    await clickButton('Read')
    expect(markRead).toHaveBeenCalledWith('notification-1', 'token')
    expect(document.body.textContent).toContain('0 unread')
    expect(document.querySelector('[aria-label^="Unread notification"]')).toBeNull()
  })

  it('renders loading and empty states from the live request', async () => {
    let resolveList!: (value: Awaited<ReturnType<NotificationsApi['list']>>) => void
    const list = vi.fn().mockReturnValue(new Promise(resolve => { resolveList = resolve }))
    const api = createApi({ list })

    await act(async () => root.render(createElement(NotificationsPage, { accessToken: 'token', api })))
    expect(document.querySelector('[aria-label="Loading notifications"]')).not.toBeNull()
    await act(async () => resolveList({ items: [], page: 1, pageSize: 20, totalCount: 0 }))
    await settle()
    expect(document.body.textContent).toContain('You’re all caught up')
  })

  it('renders API errors and retries the request', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, { detail: 'Notifications failed.' }))
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, totalCount: 0 })
    const api = createApi({ list })

    await renderPage(api)
    expect(document.body.textContent).toContain('server could not complete')
    await clickButton('Retry')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('marks all loaded notifications as read', async () => {
    const markAllRead = vi.fn().mockResolvedValue({ markedReadCount: 1, unreadCount: 0 })
    const api = createApi({
      list: vi.fn().mockResolvedValue({ items: [notification()], page: 1, pageSize: 20, totalCount: 1 }),
      unreadCount: vi.fn().mockResolvedValue({ unreadCount: 1 }),
      markAllRead
    })
    await renderPage(api)
    await clickButton('Mark all as read')
    expect(markAllRead).toHaveBeenCalledWith('token')
    expect(document.querySelector('[aria-label^="Unread notification"]')).toBeNull()
  })
})
