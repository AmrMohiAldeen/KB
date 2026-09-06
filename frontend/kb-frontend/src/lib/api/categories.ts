import { apiRequest } from './http'
import type { KbCategoryNode } from '@/views/kb/types/categories'

export type CategoryTreeNodeResponse = {
  categoryId: string
  parentCategoryId: string | null
  name: string
  slug: string
  description: string | null
  sortOrder: number
  path: string | null
  depth: number
  articleCount: number
  status: 'Active' | 'Archived'
  visibility: 'Public' | 'Internal'
  viewerImageMediaId: string | null
  viewerIcon: string | null
  localizations: CategoryLocalization[]
  children: CategoryTreeNodeResponse[]
}

export type CategoryDetailsResponse = {
  id: string
  parentCategoryId: string | null
  name: string
  slug: string
  description: string | null
  sortOrder: number
  path: string | null
  depth: number
  articleCount: number
  status: 'Active' | 'Archived'
  visibility: 'Public' | 'Internal'
  viewerImageMediaId: string | null
  viewerIcon: string | null
  localizations: CategoryLocalization[]
}

export type CreateCategoryRequest = {
  parentCategoryId: string | null
  name: string
  description: string | null
  sortOrder: number
  slug?: string | null
  visibility: 'Public' | 'Internal'
  viewerImageMediaId: string | null
  viewerIcon: string | null
}

export type CategoryLocalization = { localeCode: string; name: string; description: string | null }
export type CategoryLocalizationLanguage = {
  localeCode: string
  displayName: string
  nativeName: string
  isDefault: boolean
  isRtl: boolean
  sortOrder: number
}

export type UpdateCategoryLocalizationsRequest = {
  localizations: Array<{ localeCode: string; name: string | null; description: string | null }>
}

export type UpdateCategoryRequest = {
  name: string
  description: string | null
  sortOrder: number
  slug: string | null
  visibility: 'Public' | 'Internal'
  viewerImageMediaId: string | null
  viewerIcon: string | null
}

export type MoveCategoryRequest = {
  parentCategoryId: string | null
  sortOrder: number
}

export const mapCategoryTreeNode = (
  category: CategoryTreeNodeResponse
): KbCategoryNode => ({
  id: category.categoryId,
  parentId: category.parentCategoryId,
  name: category.name,
  description: category.description ?? '',
  slug: category.slug,
  sortOrder: category.sortOrder,
  path: category.path,
  depth: category.depth,
  articleCount: category.articleCount,
  status: category.status,
  visibility: category.visibility,
  viewerImageMediaId: category.viewerImageMediaId,
  viewerIcon: category.viewerIcon,
  localizations: category.localizations ?? [],
  children: category.children.map(mapCategoryTreeNode)
})

export const getCategoryTree = async (
  accessToken: string,
  signal?: AbortSignal
): Promise<KbCategoryNode[]> => {
  const response = await apiRequest<CategoryTreeNodeResponse[]>(
    '/api/categories/tree',
    accessToken,
    { signal }
  )

  return response.map(mapCategoryTreeNode)
}

export const getCategoryById = (
  id: string,
  accessToken: string,
  signal?: AbortSignal
) =>
  apiRequest<CategoryDetailsResponse>(
    `/api/categories/${encodeURIComponent(id)}`,
    accessToken,
    { signal }
  )

export const getCategoryLocalizationLanguages = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<CategoryLocalizationLanguage[]>('/api/categories/localization-languages', accessToken, { signal })

export const createCategory = (
  request: CreateCategoryRequest,
  accessToken: string
) =>
  apiRequest<CategoryDetailsResponse>('/api/categories', accessToken, {
    method: 'POST',
    body: JSON.stringify(request)
  })

export const updateCategory = (
  id: string,
  request: UpdateCategoryRequest,
  accessToken: string
) =>
  apiRequest<CategoryDetailsResponse>(
    `/api/categories/${encodeURIComponent(id)}`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify(request)
    }
  )

export const updateCategoryLocalizations = (id: string, request: UpdateCategoryLocalizationsRequest,
  accessToken: string) => apiRequest<CategoryDetailsResponse>(
  `/api/categories/${encodeURIComponent(id)}/localizations`,
  accessToken,
  { method: 'PUT', body: JSON.stringify(request) }
)

export const moveCategory = (
  id: string,
  request: MoveCategoryRequest,
  accessToken: string
) =>
  apiRequest<CategoryDetailsResponse>(
    `/api/categories/${encodeURIComponent(id)}/move`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(request)
    }
  )

export const deleteCategory = (
  id: string,
  accessToken: string
) =>
  apiRequest<void>(
    `/api/categories/${encodeURIComponent(id)}`,
    accessToken,
    { method: 'DELETE' }
  )

export const archiveCategory = (id: string, accessToken: string) =>
  apiRequest<CategoryDetailsResponse>(`/api/categories/${encodeURIComponent(id)}/archive`, accessToken, {
    method: 'POST'
  })

export const unarchiveCategory = (id: string, accessToken: string) =>
  apiRequest<CategoryDetailsResponse>(`/api/categories/${encodeURIComponent(id)}/unarchive`, accessToken, {
    method: 'POST'
  })
