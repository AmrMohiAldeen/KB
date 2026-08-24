export const auditActionOptions = [
  ['ArticleCreated', 'Article created'],
  ['ArticleMetadataUpdated', 'Article metadata updated'],
  ['ArticleArchived', 'Archived'],
  ['ArticleUnarchived', 'Restored from archive'],
  ['ArticleDraftContentSaved', 'Draft saved'],
  ['ArticleSubmittedForReview', 'Submitted for review'],
  ['ArticleReviewStarted', 'Review started'],
  ['ArticleChangesRequested', 'Changes requested'],
  ['ArticleApproved', 'Approved'],
  ['ArticleRejected', 'Rejected'],
  ['ArticlePublished', 'Published'],
  ['ArticleRestored', 'Restored'],
  ['ArticleDeleted', 'Deleted'],
  ['ArticleDraftLockAcquired', 'Draft locked'],
  ['ArticleDraftLockReleased', 'Draft unlocked'],
  ['ArticleDraftLockForceReleased', 'Draft force-unlocked'],
  ['ArticleCommentCreated', 'Comment created'],
  ['ArticleCommentReplied', 'Comment replied'],
  ['ArticleCommentUpdated', 'Comment updated'],
  ['ArticleCommentDeleted', 'Comment deleted'],
  ['ArticleCommentResolved', 'Comment resolved'],
  ['ArticleCommentReopened', 'Comment reopened'],
  ['ArticleCommentAnchorChanged', 'Comment anchor changed'],
  ['MediaUploaded', 'Media uploaded'],
  ['MediaReplaced', 'Media replaced'],
  ['MediaArchived', 'Media archived'],
  ['MediaRestored', 'Media restored'],
  ['MediaDeleted', 'Media deleted'],
  ['CategoryCreated', 'Category created'],
  ['CategoryUpdated', 'Category updated'],
  ['CategoryMoved', 'Category moved'],
  ['CategoryDeleted', 'Category deleted'],
  ['UserCreated', 'User created'],
  ['UserRoleAssigned', 'Role assigned'],
  ['UserRoleChanged', 'Role changed']
] as const

const auditActionLabels = new Map<string, string>(auditActionOptions)

export const formatAuditAction = (action: string): string =>
  auditActionLabels.get(action) ??
  action.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^Article /, '')

export const formatAuditDetails = (metadata: unknown): string => {
  if (metadata === null || typeof metadata === 'undefined') return '—'
  if (typeof metadata === 'string') return metadata
  if (typeof metadata === 'number' || typeof metadata === 'boolean') return String(metadata)

  try {
    return JSON.stringify(metadata)
  } catch {
    return 'Details unavailable'
  }
}

export const toUtcIso = (localDateTime: string): string | undefined => {
  if (!localDateTime) return undefined
  const date = new Date(localDateTime)

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
