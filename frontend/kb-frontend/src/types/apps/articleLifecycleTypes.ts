import type { JSONContent } from '@tiptap/core'
import type { ArticleStatus, PagedResponse, UserSummaryResponse } from './articleTypes'

export type ArticleLifecycleAction =
  | 'submitForReview'
  | 'startReview'
  | 'requestChanges'
  | 'approve'
  | 'reject'
  | 'publish'
  | 'override'
  | 'archive'

export type ArticlePermissionsResponse = {
  canEdit: boolean
  canSubmitForReview: boolean
  canReview: boolean
  canRequestChanges: boolean
  canApprove: boolean
  canPublish: boolean
  canDelete: boolean
  canViewVersionHistory: boolean
  canRestoreVersion: boolean
  canLock: boolean
  canUnlock: boolean
  canComment: boolean
  canSuggest: boolean
  canOverrideWorkflow: boolean
  workflowOverrideTargets: ArticleStatus[]
}

export type ArticleLifecycleResponse = {
  articleId: string
  draftId: string
  status: ArticleStatus
  rowVersion: string
  publishedVersionId: string | null
  publishedVersionNumber: number | null
  changedAt: string
}

export type ArticleReviewEventResponse = {
  reviewEventId: string
  articleId: string
  draftId: string | null
  fromStatus: ArticleStatus | null
  toStatus: ArticleStatus
  action: string
  actor: UserSummaryResponse
  comment: string | null
  createdAt: string
}

export type ArticleVersionSummaryResponse = {
  versionId: string
  articleId: string
  versionNumber: number
  contentHash: string | null
  contentSizeBytes: number
  sourceDraftId: string | null
  sourceDraftNumber: number | null
  snapshotReason: 'SubmittedForReview' | 'Approved' | 'Published'
  isPublished: boolean
  createdBy: UserSummaryResponse
  createdAt: string
  publishedBy: UserSummaryResponse | null
  publishedAt: string | null
}

export type ArticleVersionDetailsResponse = ArticleVersionSummaryResponse & {
  plainText: string
  renderedHtml: string | null
}

export type PublishedArticleVersionResponse = Omit<
  ArticleVersionSummaryResponse,
  'sourceDraftId' | 'sourceDraftNumber' | 'snapshotReason' | 'isPublished'
> & {
  content: JSONContent
}

export type ArticleVersionListResponse = PagedResponse<ArticleVersionSummaryResponse>

export type VersionDiffSegmentResponse = {
  changeType: 'Unchanged' | 'Added' | 'Removed'
  text: string
}

export type VersionDiffEntryResponse = {
  changeType: 'Added' | 'Removed' | 'Changed' | 'Unchanged'
  blockType: string
  blockLabel: string
  beforePosition: number | null
  afterPosition: number | null
  beforeText: string | null
  afterText: string | null
  segments: VersionDiffSegmentResponse[]
}

export type ArticleVersionComparisonResponse = {
  baseVersion: ArticleVersionSummaryResponse
  targetVersion: ArticleVersionSummaryResponse
  changes: VersionDiffEntryResponse[]
  addedCount: number
  removedCount: number
  changedCount: number
  unchangedCount: number
}

export type ArticleVersionListQuery = {
  page: number
  pageSize: number
}

export type LifecycleCommentRequest = {
  rowVersion: string
  comment?: string | null
  additionalRecipientIds?: string[]
}

export type WorkflowOverrideRequest = {
  targetStatus: ArticleStatus
  reason: string
  rowVersion: string
  additionalRecipientIds?: string[]
}

export type RestoreArticleVersionRequest = {
  rowVersion: string
}
