import { ApiError, apiRequest, describeApiError } from './http'
import type {
  ArticleDetailsResponse,
  ArticleListItemResponse,
  ArticleListQuery,
  CreateArticleRequest,
  PagedResponse,
  UpdateArticleRequest
} from '@/types/apps/articleTypes'

export const getArticles = (query: ArticleListQuery, accessToken: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection
  })

  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.categoryId) params.set('categoryId', query.categoryId)
  if (query.status) params.set('status', query.status)
  if (query.ownerId) params.set('ownerId', query.ownerId)

  return apiRequest<PagedResponse<ArticleListItemResponse>>(
    `/api/articles?${params.toString()}`,
    accessToken,
    { signal }
  )
}

export const getArticleById = (id: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ArticleDetailsResponse>(`/api/articles/${encodeURIComponent(id)}`, accessToken, { signal })

export const createArticle = (request: CreateArticleRequest, accessToken: string) =>
  apiRequest<ArticleDetailsResponse>('/api/articles', accessToken, {
    method: 'POST',
    body: JSON.stringify(request)
  })

export const updateArticle = (id: string, request: UpdateArticleRequest, accessToken: string) =>
  apiRequest<ArticleDetailsResponse>(`/api/articles/${encodeURIComponent(id)}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(request)
  })

export const deleteArticle = (id: string, accessToken: string) =>
  apiRequest<void>(`/api/articles/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' })

export const isArticleConcurrencyConflict = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  `${error.problem?.title ?? ''} ${error.problem?.detail ?? ''}`.toLowerCase().includes('concurren')

export const describeArticleApiError = (error: unknown): string[] => {
  if (isArticleConcurrencyConflict(error))
    return ['This article changed after it was loaded. Close and reopen the edit dialog to reload it before trying again.']

  if (error instanceof ApiError) {
    if (error.status === 403) return ['You do not have permission to perform this article action.']
    if (error.status === 404) return ['The article or selected category no longer exists. Refresh and try again.']
    if (error.status === 409)
      return [error.message || 'That slug is already in use. Choose another slug and try again.']
  }

  return describeApiError(error)
}
