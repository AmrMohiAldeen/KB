import type {
  MarkAllNotificationsReadResponse,
  NotificationListResponse,
  NotificationResponse,
  UnreadNotificationCountResponse
} from '@/types/apps/notificationTypes'
import { apiRequest } from './http'

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
