import type {
  ArticleLifecycleAction,
  ArticleLifecycleResponse,
  ArticlePermissionsResponse,
  ArticleReviewEventResponse,
  ArticleVersionComparisonResponse,
  ArticleVersionDetailsResponse,
  ArticleVersionListQuery,
  ArticleVersionListResponse,
  LifecycleCommentRequest,
  PublishedArticleVersionResponse,
  RestoreArticleVersionRequest,
  WorkflowOverrideRequest
} from '@/types/apps/articleLifecycleTypes'
import { ApiError, apiRequest, describeApiError } from './http'

const articlePath = (articleId: string) => `/api/articles/${encodeURIComponent(articleId)}`

const actionPaths: Record<Exclude<ArticleLifecycleAction, 'override' | 'archive'>, string> = {
  submitForReview: 'submit-for-review',
  startReview: 'review/start',
  requestChanges: 'review/request-changes',
  approve: 'review/approve',
  reject: 'review/reject',
  publish: 'publish'
}

export const getArticlePermissions = (articleId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ArticlePermissionsResponse>(`${articlePath(articleId)}/permissions`, accessToken, { signal })

export const getArticleReviewHistory = (articleId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ArticleReviewEventResponse[]>(`${articlePath(articleId)}/review-history`, accessToken, { signal })

export const getArticleVersions = (
  articleId: string,
  query: ArticleVersionListQuery,
  accessToken: string,
  signal?: AbortSignal
) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize)
  })

  return apiRequest<ArticleVersionListResponse>(
    `${articlePath(articleId)}/versions?${params.toString()}`,
    accessToken,
    { signal }
  )
}

export const getArticleVersion = (
  articleId: string,
  versionId: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ArticleVersionDetailsResponse>(
  `${articlePath(articleId)}/versions/${encodeURIComponent(versionId)}`,
  accessToken,
  { signal }
)

export const getPublishedArticleVersion = (articleId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<PublishedArticleVersionResponse>(`${articlePath(articleId)}/published-version`, accessToken, { signal })

export const compareArticleVersions = (
  articleId: string,
  baseVersionId: string,
  targetVersionId: string,
  accessToken: string,
  signal?: AbortSignal
) => {
  const params = new URLSearchParams({ baseVersionId, targetVersionId })

  return apiRequest<ArticleVersionComparisonResponse>(
    `${articlePath(articleId)}/versions/compare?${params.toString()}`,
    accessToken,
    { signal }
  )
}

export const transitionArticle = (
  articleId: string,
  action: Exclude<ArticleLifecycleAction, 'override' | 'archive'>,
  request: LifecycleCommentRequest,
  accessToken: string
) => apiRequest<ArticleLifecycleResponse>(`${articlePath(articleId)}/${actionPaths[action]}`, accessToken, {
  method: 'POST',
  body: JSON.stringify(request)
})

export const overrideArticleWorkflow = (
  articleId: string,
  request: WorkflowOverrideRequest,
  accessToken: string
) => apiRequest<ArticleLifecycleResponse>(`${articlePath(articleId)}/workflow/override`, accessToken, {
  method: 'POST',
  body: JSON.stringify(request)
})

export const restoreArticleVersion = (
  articleId: string,
  versionId: string,
  request: RestoreArticleVersionRequest,
  accessToken: string
) => apiRequest<ArticleLifecycleResponse>(
  `${articlePath(articleId)}/versions/${encodeURIComponent(versionId)}/restore`,
  accessToken,
  { method: 'POST', body: JSON.stringify(request) }
)

export const archiveArticle = (
  articleId: string,
  rowVersion: string,
  accessToken: string,
  additionalRecipientIds: string[] = []
) =>
  apiRequest<void>(`${articlePath(articleId)}/archive`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ rowVersion, additionalRecipientIds })
  })

export const unarchiveArticle = (articleId: string, accessToken: string) =>
  apiRequest<ArticleLifecycleResponse>(`${articlePath(articleId)}/unarchive`, accessToken, {
    method: 'POST'
  })

export const isLifecycleConflict = (error: unknown) => {
  if (!(error instanceof ApiError) || error.status !== 409) return false

  const problem = `${error.problem?.title ?? ''} ${error.problem?.detail ?? ''}`.toLowerCase()
  return problem.includes('concurren') ||
    problem.includes('row version') ||
    problem.includes('changed after') ||
    problem.includes('changed by another')
}

export const describeLifecycleError = (error: unknown): string[] => {
  if (error instanceof ApiError) {
    if (error.validationMessages.length) return error.validationMessages
    if (error.status === 401) return ['Your session expired. Sign in again, then reload this article.']
    if (error.status === 403) return ['You no longer have permission to perform this lifecycle action.']
    if (error.status === 404) return ['This article or version no longer exists. Reload the page to continue.']
    if (error.status === 409)
      return [error.message || 'The article changed after it was loaded. Reload it before trying again.']
  }

  return describeApiError(error)
}
