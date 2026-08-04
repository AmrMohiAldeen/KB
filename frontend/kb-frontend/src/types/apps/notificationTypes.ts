import type { PagedResponse } from './articleTypes'

export type NotificationResponse = {
  notificationId: string
  articleId: string | null
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
  readAt: string | null
}

export type NotificationListResponse = PagedResponse<NotificationResponse>
export type UnreadNotificationCountResponse = { unreadCount: number }
export type MarkAllNotificationsReadResponse = { markedReadCount: number; unreadCount: number }
