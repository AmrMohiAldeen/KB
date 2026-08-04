import type { JSONContent } from '@tiptap/core'

export type DraftUserSummaryResponse = {
  userId: string
  fullName: string
}

export type DraftLockStatusResponse = {
  isLocked: boolean
  lockedBy: DraftUserSummaryResponse | null
  lockedAt: string | null
}

export type ArticleDraftResponse = {
  draftId: string
  articleId: string
  content: JSONContent
  contentHash: string | null
  contentSizeBytes: number
  rowVersion: string
  status: string
  lock: DraftLockStatusResponse
  canEdit: boolean
  isLockOwner: boolean
  createdBy: DraftUserSummaryResponse
  updatedBy: DraftUserSummaryResponse | null
  createdAt: string
  updatedAt: string
}

export type DraftConcurrencyRequest = {
  rowVersion: string
}

export type DraftLockMutationResponse = {
  rowVersion: string
  lock: DraftLockStatusResponse
  canEdit: boolean
  isLockOwner: boolean
  updatedAt: string
}

export type SaveArticleDraftRequest = {
  content: JSONContent
  renderedHtml?: string | null
  plainText?: string | null
  rowVersion: string
}

export type SaveArticleDraftResponse = {
  draftId: string
  contentHash: string | null
  contentSizeBytes: number
  rowVersion: string
  updatedAt: string
}
