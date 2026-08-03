import { ApiError, apiRequest } from './http'
import type {
  DashboardArticleFilter,
  DashboardItem,
  DashboardItemsResponse,
  DashboardPermissionContext,
  DashboardResult,
  DashboardSort
} from '@/types/apps/dashboardTypes'

export const defaultDashboardPageSize = 25

const mapDashboardItems = (response: DashboardItemsResponse): DashboardItem[] =>
  response.items.flatMap<DashboardItem>(item => {
    if (item.kind === 'category' && item.category) {
      return [{
        kind: 'category',
        id: `category:${item.category.id}`,
        category: {
          ...item.category,
          description: item.category.description ?? '',
          children: []
        }
      }]
    }

    if (item.kind === 'article' && item.article) {
      return [{
        kind: 'article',
        id: `article:${item.article.articleId}`,
        article: item.article
      }]
    }

    return []
  })

export const getDashboardItems = async ({
  accessToken,
  filter,
  search,
  categoryId,
  sort,
  page = 1,
  pageSize = defaultDashboardPageSize,
  signal
}: {
  accessToken: string
  filter: DashboardArticleFilter
  search?: string
  categoryId?: string
  sort: DashboardSort
  page?: number
  pageSize?: number
  signal?: AbortSignal
}): Promise<DashboardResult> => {
  const query = new URLSearchParams({
    filter,
    sortBy: sort,
    page: page.toString(),
    pageSize: pageSize.toString()
  })

  if (search) query.set('search', search)
  if (categoryId) query.set('categoryId', categoryId)

  const response = await apiRequest<DashboardItemsResponse>(
    `/api/dashboard/items?${query.toString()}`,
    accessToken,
    { signal }
  )

  return {
    ...response,
    items: mapDashboardItems(response),
    filterCounts: {
      Everything: response.filterCounts.everything,
      Published: response.filterCounts.published,
      DraftUnpublished: response.filterCounts.draftUnpublished,
      ToReview: response.filterCounts.toReview,
      Archived: response.filterCounts.archived
    }
  }
}

export const getDashboardPermissionContext = async (
  accessToken: string,
  signal?: AbortSignal
): Promise<DashboardPermissionContext | null> => {
  try {
    return await apiRequest<DashboardPermissionContext>('/api/auth/me/permissions', accessToken, { signal })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}
