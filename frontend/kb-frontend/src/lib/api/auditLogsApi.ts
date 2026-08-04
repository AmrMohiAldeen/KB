import type { AuditLogQuery, PagedAuditLogResponse } from '@/types/apps/auditLogTypes'
import { apiRequest, describeApiError } from './http'

export const getAuditLogs = (
  query: AuditLogQuery,
  accessToken: string,
  signal?: AbortSignal
) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortDirection: query.sortDirection
  })

  if (query.articleId) params.set('articleId', query.articleId)
  if (query.userId) params.set('userId', query.userId)
  if (query.article?.trim()) params.set('article', query.article.trim())
  if (query.user?.trim()) params.set('user', query.user.trim())
  if (query.actionType) params.set('actionType', query.actionType)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)

  return apiRequest<PagedAuditLogResponse>(
    `/api/audit-logs?${params.toString()}`,
    accessToken,
    { signal }
  )
}

export const describeAuditLogApiError = (error: unknown): string[] =>
  describeApiError(error).map(message =>
    message === 'You do not have permission to perform this action.'
      ? 'You do not have permission to view audit logs.'
      : message
  )
