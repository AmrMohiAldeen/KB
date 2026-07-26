export type ArticleStatus =
  | 'Draft'
  | 'SubmittedForReview'
  | 'InReview'
  | 'ChangesRequested'
  | 'Resubmitted'
  | 'Approved'
  | 'Published'

export type UserSummaryResponse = {
  userId: string
  fullName: string
}

export type CategorySummaryResponse = {
  categoryId: string
  name: string
  slug: string
  path: string | null
}

export type ArticleListItemResponse = {
  articleId: string
  title: string
  slug: string
  status: ArticleStatus
  category: CategorySummaryResponse | null
  owner: UserSummaryResponse
  currentDraftId: string | null
  currentPublishedVersionId: string | null
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  isCurrentDraftLocked: boolean
  lockedBy: UserSummaryResponse | null
}

export type ArticleDraftMetadataResponse = {
  draftId: string
  contentHash: string | null
  contentSizeBytes: number
  rowVersion: string
  status: string
  isLocked: boolean
  lockedBy: UserSummaryResponse | null
  lockedAt: string | null
  createdBy: UserSummaryResponse
  updatedBy: UserSummaryResponse | null
  createdAt: string
  updatedAt: string
}

export type ArticlePublishedVersionMetadataResponse = {
  versionId: string
  versionNumber: number
  contentHash: string | null
  contentSizeBytes: number
  createdBy: UserSummaryResponse
  createdAt: string
  publishedBy: UserSummaryResponse | null
  publishedAt: string | null
}

export type ArticleDetailsResponse = {
  articleId: string
  title: string
  slug: string
  status: ArticleStatus
  category: CategorySummaryResponse | null
  owner: UserSummaryResponse
  currentDraft: ArticleDraftMetadataResponse | null
  currentPublishedVersion: ArticlePublishedVersionMetadataResponse | null
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  approvedAt: string | null
  publishedAt: string | null
}

export type CreateArticleRequest = {
  title: string
  categoryId: string
  slug: string | null
}

export type UpdateArticleRequest = CreateArticleRequest & {
  rowVersion: string
}

export type PagedResponse<T> = {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
}

export type ArticleSortField = 'title' | 'createdAt' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

export type ArticleListQuery = {
  search?: string
  categoryId?: string
  status?: ArticleStatus
  ownerId?: string
  page: number
  pageSize: number
  sortBy: ArticleSortField
  sortDirection: SortDirection
}
