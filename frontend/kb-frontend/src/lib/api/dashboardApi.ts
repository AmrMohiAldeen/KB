import { ApiError, apiRequest } from './http'
import { getArticles } from './articlesApi'
import type { ArticleListItemResponse, ArticleSortField, ArticleStatus } from '@/types/apps/articleTypes'
import type {
  DashboardArticleFilter,
  DashboardArticleResult,
  DashboardPermissionContext,
  DashboardSort
} from '@/types/apps/dashboardTypes'

const dashboardPageSize = 100
// TODO(backend): add GET /api/dashboard/items with a discriminated category/article result,
// grouped status filters, cross-entity search/sort, stable position, filter counts, and pagination.
// The existing endpoints are composed below until that aggregate contract exists.
const nonPublishedStatuses: ArticleStatus[] = [
  'Draft',
  'SubmittedForReview',
  'InReview',
  'ChangesRequested',
  'Resubmitted',
  'Approved'
]
const reviewStatuses: ArticleStatus[] = ['SubmittedForReview', 'InReview', 'Resubmitted']

export const statusesForDashboardFilter = (filter: DashboardArticleFilter): ArticleStatus[] | null => {
  switch (filter) {
    case 'Everything':
      return null
    case 'Published':
      return ['Published']
    case 'DraftUnpublished':
      return nonPublishedStatuses
    case 'ToReview':
      return reviewStatuses
    case 'Archived':
      return []
  }
}

const articleSortField = (sort: DashboardSort): ArticleSortField => {
  if (sort === 'title') return 'title'
  if (sort === 'createdAt') return 'createdAt'

  return 'updatedAt'
}

const sortArticles = (
  articles: ArticleListItemResponse[],
  sort: DashboardSort
) => [...articles].sort((left, right) => {
  if (sort === 'title' || sort === 'position')
    return left.title.localeCompare(right.title)

  const field = sort === 'createdAt' ? 'createdAt' : 'updatedAt'

  return new Date(right[field]).getTime() - new Date(left[field]).getTime()
})

export const getDashboardArticles = async ({
  accessToken,
  filter,
  search,
  categoryId,
  sort,
  signal
}: {
  accessToken: string
  filter: DashboardArticleFilter
  search?: string
  categoryId?: string
  sort: DashboardSort
  signal?: AbortSignal
}): Promise<DashboardArticleResult> => {
  const statuses = statusesForDashboardFilter(filter)

  // TODO(backend): add archivedAt/isArchived plus an Archived list filter to GET /api/articles.
  if (filter === 'Archived')
    return { items: [], totalCount: 0, truncated: false, statuses }

  const queries = statuses?.length ? statuses : [undefined]
  const results = await Promise.all(queries.map(status => getArticles({
    search,
    categoryId,
    status,
    page: 1,
    pageSize: dashboardPageSize,
    sortBy: articleSortField(sort),
    sortDirection: sort === 'title' || sort === 'position' ? 'asc' : 'desc'
  }, accessToken, signal)))
  const byId = new Map(results.flatMap(result => result.items).map(article => [article.articleId, article]))
  const totalCount = results.reduce((total, result) => total + result.totalCount, 0)

  return {
    items: sortArticles(Array.from(byId.values()), sort),
    totalCount,
    truncated: results.some(result => result.totalCount > result.items.length),
    statuses
  }
}

export const getDashboardEverythingCount = async ({
  accessToken,
  search,
  categoryId,
  signal
}: {
  accessToken: string
  search?: string
  categoryId?: string
  signal?: AbortSignal
}) => {
  const response = await getArticles({
    search,
    categoryId,
    page: 1,
    pageSize: 1,
    sortBy: 'updatedAt',
    sortDirection: 'desc'
  }, accessToken, signal)

  return response.totalCount
}

export const getDashboardPermissionContext = async (
  accessToken: string,
  signal?: AbortSignal
): Promise<DashboardPermissionContext | null> => {
  try {
    // TODO(backend): implement GET /api/auth/me/permissions returning
    // { userId: string, permissions: KbPermissionAction[] } for effective global permissions.
    return await apiRequest<DashboardPermissionContext>('/api/auth/me/permissions', accessToken, { signal })
  } catch (error) {
    // Until the endpoint exists, fail closed so privileged controls never flash or become available.
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}
