import type { Content } from '@tiptap/core'
import { apiBlobRequest, apiRequest, viewerApiRequest, viewerBlobRequest } from './http'

export type ViewerPortal = { solutionId: string; slug: string; name: string; description: string | null }
export type ViewerCategoryNode = {
  categoryId: string
  parentCategoryId: string | null
  name: string
  slug: string
  description: string | null
  sortOrder: number
  path: string | null
  depth: number
  articleCount: number
  hasViewerImage: boolean
  viewerIcon: string | null
  children: ViewerCategoryNode[]
}
export type ViewerArticleSummary = {
  articleId: string
  title: string
  slug: string
  categoryId: string
  categoryName: string
  categoryPath: string
  updatedAt: string
}
export type ViewerArticle = ViewerArticleSummary & { content: Content }

const root = (solutionSlug: string) => `/api/viewer/${encodeURIComponent(solutionSlug)}`
const previewRoot = (categorySlug: string) => `/api/viewer/preview/${encodeURIComponent(categorySlug)}`

export const getViewerPortal = (solutionSlug: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerPortal>(root(solutionSlug), { signal })
export const getViewerCategories = (solutionSlug: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerCategoryNode[]>(`${root(solutionSlug)}/categories/tree`, { signal })
export const getViewerArticles = (solutionSlug: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticleSummary[]>(`${root(solutionSlug)}/articles`, { signal })
export const searchViewerArticles = (solutionSlug: string, query: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticleSummary[]>(`${root(solutionSlug)}/search?query=${encodeURIComponent(query)}`, { signal })
export const getViewerArticle = (solutionSlug: string, articleSlug: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticle>(`${root(solutionSlug)}/articles/${encodeURIComponent(articleSlug)}`, { signal })
export const getViewerCategoryImage = (solutionSlug: string, categoryId: string, signal?: AbortSignal) =>
  viewerBlobRequest(`${root(solutionSlug)}/categories/${encodeURIComponent(categoryId)}/image`, signal)
export const signOutViewer = () => viewerApiRequest<void>('/api/viewer/auth/signout', { method: 'POST' })

export const getViewerPreviewPortal = (categorySlug: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerPortal>(previewRoot(categorySlug), accessToken, { signal })
export const getViewerPreviewCategories = (categorySlug: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerCategoryNode[]>(`${previewRoot(categorySlug)}/categories/tree`, accessToken, { signal })
export const getViewerPreviewArticles = (categorySlug: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerArticleSummary[]>(`${previewRoot(categorySlug)}/articles`, accessToken, { signal })
export const searchViewerPreviewArticles = (
  categorySlug: string,
  query: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticleSummary[]>(
  `${previewRoot(categorySlug)}/search?query=${encodeURIComponent(query)}`,
  accessToken,
  { signal }
)
export const getViewerPreviewArticle = (
  categorySlug: string,
  articleSlug: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticle>(
  `${previewRoot(categorySlug)}/articles/${encodeURIComponent(articleSlug)}`,
  accessToken,
  { signal }
)
export const getViewerPreviewCategoryImage = (
  categorySlug: string,
  categoryId: string,
  accessToken: string,
  signal?: AbortSignal
) => apiBlobRequest(
  `${previewRoot(categorySlug)}/categories/${encodeURIComponent(categoryId)}/image`,
  accessToken,
  signal
)
