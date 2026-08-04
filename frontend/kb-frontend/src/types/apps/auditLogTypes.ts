import type { PagedResponse, SortDirection, UserSummaryResponse } from './articleTypes'

export type AuditArticleSummaryResponse = {
  articleId: string
  title: string
  slug: string
}

export type ArticleAuditLogResponse = {
  auditLogId: string
  articleId: string | null
  article: AuditArticleSummaryResponse | null
  actor: UserSummaryResponse | null
  actionType: string
  entityType: string | null
  entityId: string | null
  metadata: unknown
  createdAt: string
}

export type AuditLogQuery = {
  articleId?: string
  userId?: string
  article?: string
  user?: string
  actionType?: string
  from?: string
  to?: string
  page: number
  pageSize: number
  sortDirection: SortDirection
}

export type PagedAuditLogResponse = PagedResponse<ArticleAuditLogResponse>
