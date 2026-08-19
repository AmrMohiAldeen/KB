import type { Content } from '@tiptap/core'
import { apiRequest, viewerApiRequest } from './http'

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
const previewRoot = (categoryId: string) => `/api/viewer/preview/${encodeURIComponent(categoryId)}`

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
export const signOutViewer = () => viewerApiRequest<void>('/api/viewer/auth/signout', { method: 'POST' })

export const getViewerPreviewPortal = (categoryId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerPortal>(previewRoot(categoryId), accessToken, { signal })
export const getViewerPreviewCategories = (categoryId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerCategoryNode[]>(`${previewRoot(categoryId)}/categories/tree`, accessToken, { signal })
export const getViewerPreviewArticles = (categoryId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerArticleSummary[]>(`${previewRoot(categoryId)}/articles`, accessToken, { signal })
export const searchViewerPreviewArticles = (
  categoryId: string,
  query: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticleSummary[]>(
  `${previewRoot(categoryId)}/search?query=${encodeURIComponent(query)}`,
  accessToken,
  { signal }
)
export const getViewerPreviewArticle = (
  categoryId: string,
  articleSlug: string,
  accessToken: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticle>(
  `${previewRoot(categoryId)}/articles/${encodeURIComponent(articleSlug)}`,
  accessToken,
  { signal }
)
