import type {
  ArticleNotificationPreferenceResponse,
  MarkAllNotificationsReadResponse,
  NotificationListResponse,
  NotificationRecipientResponse,
  NotificationResponse,
  UnreadNotificationCountResponse
} from '@/types/apps/notificationTypes'
import { ApiError, apiRequest, describeApiError } from './http'

export type NotificationsApi = {
  list: (page: number, pageSize: number, accessToken: string, signal?: AbortSignal) =>
    Promise<NotificationListResponse>
  unreadCount: (accessToken: string, signal?: AbortSignal) => Promise<UnreadNotificationCountResponse>
  markRead: (notificationId: string, accessToken: string) => Promise<NotificationResponse>
  markAllRead: (accessToken: string) => Promise<MarkAllNotificationsReadResponse>
}

export const notificationsApi: NotificationsApi = {
  list: (page, pageSize, accessToken, signal) => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    return apiRequest<NotificationListResponse>(`/api/notifications?${query}`, accessToken, { signal })
  },
  unreadCount: (accessToken, signal) =>
    apiRequest<UnreadNotificationCountResponse>('/api/notifications/unread-count', accessToken, { signal }),
  markRead: (notificationId, accessToken) =>
    apiRequest<NotificationResponse>(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`, accessToken, { method: 'PATCH' }
    ),
  markAllRead: accessToken =>
    apiRequest<MarkAllNotificationsReadResponse>('/api/notifications/read-all', accessToken, { method: 'PATCH' })
}

export const getArticleNotificationPreference = (
  articleId: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ArticleNotificationPreferenceResponse>(
  `/api/notifications/articles/${encodeURIComponent(articleId)}/preference`, accessToken, { signal }
)

export const setArticleNotificationPreference = (
  articleId: string,
  enabled: boolean,
  accessToken: string
) => apiRequest<ArticleNotificationPreferenceResponse>(
  `/api/notifications/articles/${encodeURIComponent(articleId)}/preference`, accessToken,
  { method: 'PUT', body: JSON.stringify({ enabled }) }
)

export const getNotificationRecipients = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<NotificationRecipientResponse[]>('/api/notifications/recipients', accessToken, { signal })

export const describeNotificationApiError = (error: unknown): string[] => {
  if (error instanceof ApiError && error.status >= 500) {
    const message = 'The server could not complete the notification request. Try again later.'

    return [error.problem?.traceId ? `${message} (Reference: ${error.problem.traceId})` : message]
  }

  return describeApiError(error)
}
