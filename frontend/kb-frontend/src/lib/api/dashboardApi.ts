import { ApiError, apiRequest } from './http'
import type {
  DashboardArticleFilter,
  DashboardBulkActionResponse,
  DashboardBulkSelection,
  DashboardItem,
  DashboardItemsResponse,
  DashboardPermissionContext,
  DashboardResult,
  DashboardSort,
  InternalSearchResponse,
  InternalSearchResult
} from '@/types/apps/dashboardTypes'
import type { ArticleStatus } from '@/types/apps/articleTypes'

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

export const searchDashboard = async ({
  accessToken,
  query,
  status,
  categoryId,
  ownerId,
  page = 1,
  pageSize = defaultDashboardPageSize,
  signal
}: {
  accessToken: string
  query: string
  status?: string
  categoryId?: string
  ownerId?: string
  page?: number
  pageSize?: number
  signal?: AbortSignal
}): Promise<InternalSearchResult> => {
  const parameters = new URLSearchParams({ query, page: page.toString(), pageSize: pageSize.toString() })

  if (status) parameters.set('status', status)
  if (categoryId) parameters.set('categoryId', categoryId)
  if (ownerId) parameters.set('ownerId', ownerId)
  const response = await apiRequest<InternalSearchResponse>(
    `/api/dashboard/search?${parameters.toString()}`,
    accessToken,
    { signal }
  )

  const items = response.hits.map(hit => {
    const search = {
      titleHighlight: hit.titleHighlight,
      pathHighlight: hit.pathHighlight,
      snippet: hit.snippet
    }

    if (hit.kind === 'category') {
      return {
        kind: 'category' as const,
        id: `category:${hit.id}`,
        category: {
          id: hit.id,
          parentId: null,
          name: hit.title,
          slug: hit.slug,
          description: '',
          sortOrder: 0,
          path: hit.categoryPath,
          depth: 0,
          articleCount: 0,
          children: [],
          status: hit.status === 'Archived' ? 'Archived' as const : 'Active' as const
        },
        search
      }
    }

    return {
      kind: 'article' as const,
      id: `article:${hit.id}`,
      article: {
        articleId: hit.id,
        title: hit.title,
        slug: hit.slug,
        status: hit.status as ArticleStatus,
        category: hit.categoryId ? {
          categoryId: hit.categoryId,
          name: hit.categoryName ?? '',
          slug: '',
          path: hit.categoryPath
        } : null,
        owner: { userId: hit.ownerId ?? '', fullName: hit.ownerName ?? 'Unknown owner' },
        currentDraftId: null,
        currentPublishedVersionId: null,
        createdAt: hit.updatedAt,
        updatedAt: hit.updatedAt,
        publishedAt: null,
        isCurrentDraftLocked: false,
        lockedBy: null,
        position: 0
      },
      search
    }
  })

  return { items, totalCount: response.totalCount, statuses: response.statuses,
    categories: response.categories, owners: response.owners }
}

export const reorderDashboardItem = ({
  accessToken,
  kind,
  id,
  targetId,
  placement
}: {
  accessToken: string
  kind: 'category' | 'article'
  id: string
  targetId: string
  placement: 'before' | 'after'
}) => apiRequest<void>(
  `/api/dashboard/${kind === 'category' ? 'categories' : 'articles'}/${encodeURIComponent(id)}/position`,
  accessToken,
  {
    method: 'PATCH',
    body: JSON.stringify({ targetId, placement })
  }
)

export const moveDashboardItems = (
  selection: DashboardBulkSelection,
  destinationCategoryId: string,
  accessToken: string
) => apiRequest<DashboardBulkActionResponse>('/api/dashboard/bulk/move', accessToken, {
  method: 'POST',
  body: JSON.stringify({ ...selection, destinationCategoryId })
})

export const duplicateDashboardItems = (
  selection: DashboardBulkSelection,
  accessToken: string
) => apiRequest<DashboardBulkActionResponse>('/api/dashboard/bulk/duplicate', accessToken, {
  method: 'POST',
  body: JSON.stringify(selection)
})
