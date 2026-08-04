export type CommentAnchorType = 'TextRange' | 'Block'
export type CommentAnchorStatus = 'Attached' | 'NeedsReanchoring' | 'Orphaned'
export type CommentThreadStatus = 'Open' | 'Resolved'

export type TextRangeCommentAnchor = {
  from: number
  to: number
  selectedText: string
  prefix?: string
  suffix?: string
  blockId?: string | null
}

export type BlockCommentAnchor = {
  position: number
  nodeType: string
  text: string
  blockId?: string | null
}

export type CommentAnchorData = TextRangeCommentAnchor | BlockCommentAnchor

export type CommentUserSummary = {
  userId: string
  fullName: string
}

export type ArticleComment = {
  commentId: string
  articleId: string
  parentCommentId: string | null
  body: string | null
  currentDraftId: string | null
  originDraftId: string | null
  anchorType: CommentAnchorType | null
  anchorData: CommentAnchorData | null
  anchorStatus: CommentAnchorStatus
  status: CommentThreadStatus
  createdBy: CommentUserSummary
  createdAt: string
  updatedAt: string
  resolvedBy: CommentUserSummary | null
  resolvedAt: string | null
  deletedAt: string | null
  rowVersion: string
  canUpdate: boolean
  canDelete: boolean
  canResolve: boolean
  replies: ArticleComment[]
}

export type ArticleCommentsResponse = {
  threads: ArticleComment[]
  canComment: boolean
  canModerate: boolean
}

export type CreateCommentRequest = {
  body: string
  currentDraftId?: string | null
  anchorType?: CommentAnchorType | null
  anchorData?: CommentAnchorData | null
}

export type UpdateCommentRequest = {
  body: string
  rowVersion: string
}
