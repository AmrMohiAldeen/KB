import type { PagedResponse, UserSummaryResponse } from './articleTypes'

export type MediaKind = 'image' | 'gif' | 'video' | 'pdf' | 'document'
export type MediaStatus = 'Temporary' | 'Active' | 'Archived' | 'Deleted'

export type MediaListItemResponse = {
  mediaId: string
  originalFileName: string
  mimeType: string
  fileExtension: string | null
  fileSizeBytes: number
  url: string
  status: MediaStatus
  uploadedBy: UserSummaryResponse
  uploadedAt: string
  referenceCount: number
}

export type MediaDetailsResponse = MediaListItemResponse

export type MediaUploadResponse = Omit<MediaListItemResponse, 'uploadedBy' | 'referenceCount'>

export type MediaListQuery = {
  search?: string
  mediaType?: MediaKind
  status?: MediaStatus
  page: number
  pageSize: number
}

export type MediaListResponse = PagedResponse<MediaListItemResponse>

export type MediaUploadProgress = {
  loaded: number
  total: number
  percent: number
}
