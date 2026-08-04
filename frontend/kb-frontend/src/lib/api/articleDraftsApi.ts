import type {
  ArticleDraftResponse,
  DraftConcurrencyRequest,
  DraftLockMutationResponse,
  SaveArticleDraftRequest,
  SaveArticleDraftResponse
} from '@/types/apps/articleDraftTypes'
import { ApiError, apiRequest, describeApiError } from './http'

const draftPath = (articleId: string) => `/api/articles/${encodeURIComponent(articleId)}/draft`

export const getArticleDraft = (articleId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ArticleDraftResponse>(draftPath(articleId), accessToken, { signal })

export const acquireArticleDraftLock = (
  articleId: string,
  request: DraftConcurrencyRequest,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<DraftLockMutationResponse>(`${draftPath(articleId)}/lock`, accessToken, {
  method: 'POST', body: JSON.stringify(request), signal
})

export const releaseArticleDraftLock = (
  articleId: string,
  request: DraftConcurrencyRequest,
  accessToken: string,
  options: { keepalive?: boolean; signal?: AbortSignal } = {}
) => apiRequest<DraftLockMutationResponse>(`${draftPath(articleId)}/lock`, accessToken, {
  method: 'DELETE', body: JSON.stringify(request), keepalive: options.keepalive, signal: options.signal
})

export const forceReleaseArticleDraftLock = (
  articleId: string,
  request: DraftConcurrencyRequest,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<DraftLockMutationResponse>(`${draftPath(articleId)}/lock/force-release`, accessToken, {
  method: 'POST', body: JSON.stringify(request), signal
})


export const saveArticleDraftContent = (
  articleId: string,
  request: SaveArticleDraftRequest,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<SaveArticleDraftResponse>(`${draftPath(articleId)}/content`, accessToken, {
  method: 'PUT', body: JSON.stringify(request), signal
})

export const isArticleDraftConflict = (error: unknown) => error instanceof ApiError && error.status === 409

export const describeArticleDraftApiError = (error: unknown): string[] => {
  if (error instanceof ApiError) {
    if (error.status === 403) return ['You do not have permission to edit this article draft.']
    if (error.status === 404) return ['The current article draft could not be found. Return to Articles and refresh the list.']
    if (error.status === 409) return [error.message || 'The draft changed on the server. Reload it before editing again.']
    if (error.status === 503) return ['Draft content storage is unavailable. Your local changes have not been discarded.']
  }

  return describeApiError(error)
}
