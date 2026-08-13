import type { ArticleListItemResponse } from './articleTypes'
import type { ArticleStatus } from './articleTypes'
import type { KbPermissionAction } from './permissionTypes'
import type { KbCategoryNode } from '@/views/kb/types/categories'

export type DashboardArticleFilter =
  | 'Everything'
  | 'Published'
  | 'DraftUnpublished'
  | 'ToReview'
  | 'Archived'

export type DashboardSort = 'position' | 'title' | 'updatedAt' | 'createdAt'
export type DashboardView = 'list' | 'grid'

export type DashboardPermissionContext = {
  userId: string
  permissions: KbPermissionAction[]
}

export type DashboardCategoryItem = {
  kind: 'category'
  id: string
  category: KbCategoryNode
  search?: DashboardSearchMatch
}

export type DashboardArticleItem = {
  kind: 'article'
  id: string
  article: ArticleListItemResponse
  search?: DashboardSearchMatch
}

export type DashboardSearchMatch = {
  titleHighlight: string | null
  pathHighlight: string | null
  snippet: string | null
}

export type InternalSearchFacet = { value: string; count: number }
export type InternalSearchHit = {
  kind: 'article' | 'category'
  id: string
  title: string
  slug: string
  status: ArticleStatus | 'Active'
  categoryId: string | null
  categoryName: string | null
  categoryPath: string | null
  ownerId: string | null
  ownerName: string | null
  updatedAt: string
  titleHighlight: string | null
  pathHighlight: string | null
  snippet: string | null
}
export type InternalSearchResponse = {
  hits: InternalSearchHit[]
  totalCount: number
  page: number
  pageSize: number
  statuses: InternalSearchFacet[]
  categories: InternalSearchFacet[]
  owners: InternalSearchFacet[]
}
export type InternalSearchResult = {
  items: DashboardItem[]
  totalCount: number
  statuses: InternalSearchFacet[]
  categories: InternalSearchFacet[]
  owners: InternalSearchFacet[]
}

export type DashboardItem = DashboardCategoryItem | DashboardArticleItem

export type DashboardResult = {
  items: DashboardItem[]
  page: number
  pageSize: number
  totalCount: number
  articleCount: number
  everythingArticleCount: number
  filterCounts: Record<DashboardArticleFilter, number>
  truncated: boolean
}

export type DashboardCategoryResponse = Omit<KbCategoryNode, 'children' | 'description'> & {
  description: string | null
}

export type DashboardItemResponse = {
  kind: 'category' | 'article'
  id: string
  position: number
  category: DashboardCategoryResponse | null
  article: ArticleListItemResponse | null
}

export type DashboardFilterCountsResponse = {
  everything: number
  published: number
  draftUnpublished: number
  toReview: number
  archived: number
}

export type DashboardItemsResponse = Omit<DashboardResult, 'items' | 'filterCounts'> & {
  items: DashboardItemResponse[]
  filterCounts: DashboardFilterCountsResponse
}

export type DashboardBulkSelection = {
  articleIds: string[]
  categoryIds: string[]
}

export type DashboardBulkActionResponse = {
  articleCount: number
  categoryCount: number
  articleIds: string[]
  categoryIds: string[]
}
