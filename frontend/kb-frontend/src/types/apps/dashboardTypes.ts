import type { ArticleListItemResponse, ArticleStatus } from './articleTypes'
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
}

export type DashboardArticleItem = {
  kind: 'article'
  id: string
  article: ArticleListItemResponse
}

export type DashboardItem = DashboardCategoryItem | DashboardArticleItem

export type DashboardArticleResult = {
  items: ArticleListItemResponse[]
  totalCount: number
  truncated: boolean
  statuses: ArticleStatus[] | null
}
