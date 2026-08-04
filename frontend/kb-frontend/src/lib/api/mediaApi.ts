import type {
  MediaDetailsResponse,
  MediaListQuery,
  MediaListResponse,
  MediaUploadProgress,
  MediaUploadResponse
} from '@/types/apps/mediaTypes'
import {
  ApiError,
  apiBlobRequest,
  apiRequest,
  describeApiError,
  getApiBaseUrl,
  normalizeAccessToken
} from './http'
import type { ProblemDetails } from './http'

export const getMedia = (query: MediaListQuery, accessToken: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize)
  })

  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.mediaType) params.set('mediaType', query.mediaType)
  if (query.status) params.set('status', query.status)

  return apiRequest<MediaListResponse>(`/api/media?${params.toString()}`, accessToken, { signal })
}

const parseJson = (value: string): unknown => {
  if (!value.trim()) return undefined

  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

export const uploadMedia = (
  file: File,
  accessToken: string,
  onProgress?: (progress: MediaUploadProgress) => void
): Promise<MediaUploadResponse> => {
  const token = normalizeAccessToken(accessToken)

  if (!token)
    return Promise.reject(new ApiError(401, {
      status: 401,
      title: 'Unauthorized',
      detail: 'Authentication is required.'
    }))

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    const formData = new FormData()

    formData.append('file', file, file.name)
    request.open('POST', `${getApiBaseUrl()}/api/media`)
    request.setRequestHeader('Accept', 'application/json')
    request.setRequestHeader('Authorization', `Bearer ${token}`)

    request.upload.addEventListener('progress', event => {
      if (!event.lengthComputable) return

      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent: Math.min(100, Math.round((event.loaded / event.total) * 100))
      })
    })
    request.addEventListener('load', () => {
      const body = parseJson(request.responseText)

      if (request.status >= 200 && request.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 })
        resolve(body as MediaUploadResponse)
        return
      }

      reject(new ApiError(request.status, body as ProblemDetails | undefined))
    })
    request.addEventListener('error', () => {
      reject(new ApiError(0, {
        status: 0,
        title: 'Network error',
        detail: 'The knowledge base API could not be reached. Check your connection and API configuration.'
      }))
    })
    request.addEventListener('abort', () => {
      reject(new DOMException('The upload was cancelled.', 'AbortError'))
    })
    request.send(formData)
  })
}

export const getMediaContent = (id: string, accessToken: string, signal?: AbortSignal) =>
  apiBlobRequest(`/api/media/${encodeURIComponent(id)}/content`, accessToken, signal)

export const downloadMedia = (id: string, accessToken: string, signal?: AbortSignal) =>
  apiBlobRequest(`/api/media/${encodeURIComponent(id)}/download`, accessToken, signal)

export const archiveMedia = (id: string, accessToken: string) =>
  apiRequest<MediaDetailsResponse>(`/api/media/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' })

export const restoreMedia = (id: string, accessToken: string) =>
  apiRequest<MediaDetailsResponse>(`/api/media/${encodeURIComponent(id)}/restore`, accessToken, { method: 'POST' })

export const deleteMediaPermanently = (id: string, accessToken: string) =>
  apiRequest<void>(`/api/media/${encodeURIComponent(id)}/permanent`, accessToken, { method: 'DELETE' })

export const isReferencedMediaDeleteConflict = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  `${error.problem?.title ?? ''} ${error.problem?.detail ?? ''}`.toLowerCase().includes('referenced media')

export const describeMediaApiError = (error: unknown): string[] => {
  if (isReferencedMediaDeleteConflict(error))
    return ['This file is still referenced by knowledge base content. Remove all references before deleting it permanently.']

  if (error instanceof ApiError) {
    if (error.status === 403) return ['You do not have permission to perform this media action.']
    if (error.status === 404) return ['The media file no longer exists or is not available. Refresh and try again.']
    if (error.status === 409) return [error.message || 'The media status changed. Refresh and try again.']
    if (error.status === 503) return ['Media storage is temporarily unavailable. Try again later.']
  }

  return describeApiError(error)
}

export const mediaLibraryApi = {
  getList: getMedia,
  upload: uploadMedia,
  getContent: getMediaContent,
  download: downloadMedia,
  archive: archiveMedia,
  restore: restoreMedia,
  deletePermanently: deleteMediaPermanently
}

export type MediaLibraryApi = typeof mediaLibraryApi
