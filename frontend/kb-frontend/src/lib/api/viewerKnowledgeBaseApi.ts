import type { Content } from '@tiptap/core'
import { apiBlobRequest, apiRequest, viewerApiRequest, viewerBlobRequest } from './http'

export type ViewerPortal = {
  solutionId: string
  slug: string
  name: string
  description: string | null
  activeLanguage: ViewerLanguage
  languages: ViewerLanguage[]
  appearance: {
    primaryColor: string
    pageBackgroundColor: string
    categoryCardBackgroundColor: string
    textColor: string
  }
}
export type ViewerLanguage = {
  localeCode: string
  displayName: string
  nativeName: string
  isDefault: boolean
  isRtl: boolean
}
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
  displayColor?: string | null
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
export type ViewerArticleTranslation = { articleId: string; localeCode: string; slug: string }
export type ViewerArticle = ViewerArticleSummary & {
  content: Content
  activeLanguage: ViewerLanguage
  languages: ViewerLanguage[]
  availableTranslations: ViewerArticleTranslation[]
}

const root = (solutionSlug: string) => `/api/viewer/${encodeURIComponent(solutionSlug)}`
const previewRoot = (categorySlug: string) => `/api/viewer/preview/${encodeURIComponent(categorySlug)}`
const localized = (path: string, locale?: string) => locale
  ? `${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`
  : path

export const getViewerPortal = (solutionSlug: string, locale?: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerPortal>(localized(root(solutionSlug), locale), { signal })
export const getViewerCategories = (solutionSlug: string, locale?: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerCategoryNode[]>(localized(`${root(solutionSlug)}/categories/tree`, locale), { signal })
export const getViewerArticles = (solutionSlug: string, locale?: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticleSummary[]>(localized(`${root(solutionSlug)}/articles`, locale), { signal })
export const searchViewerArticles = (solutionSlug: string, query: string, locale?: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticleSummary[]>(localized(`${root(solutionSlug)}/search?query=${encodeURIComponent(query)}`, locale), { signal })
export const getViewerArticle = (solutionSlug: string, articleSlug: string, locale?: string, signal?: AbortSignal) =>
  viewerApiRequest<ViewerArticle>(localized(`${root(solutionSlug)}/articles/${encodeURIComponent(articleSlug)}`, locale), { signal })
export const getViewerCategoryImage = (solutionSlug: string, categoryId: string, signal?: AbortSignal) =>
  viewerBlobRequest(`${root(solutionSlug)}/categories/${encodeURIComponent(categoryId)}/image`, signal)
export const signOutViewer = () => viewerApiRequest<void>('/api/viewer/auth/signout', { method: 'POST' })

export const getViewerPreviewPortal = (categorySlug: string, accessToken: string, locale?: string, signal?: AbortSignal) =>
  apiRequest<ViewerPortal>(localized(previewRoot(categorySlug), locale), accessToken, { signal })
export const getViewerPreviewCategories = (categorySlug: string, accessToken: string, locale?: string, signal?: AbortSignal) =>
  apiRequest<ViewerCategoryNode[]>(localized(`${previewRoot(categorySlug)}/categories/tree`, locale), accessToken, { signal })
export const getViewerPreviewArticles = (categorySlug: string, accessToken: string, locale?: string, signal?: AbortSignal) =>
  apiRequest<ViewerArticleSummary[]>(localized(`${previewRoot(categorySlug)}/articles`, locale), accessToken, { signal })
export const searchViewerPreviewArticles = (
  categorySlug: string,
  query: string,
  accessToken: string,
  locale?: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticleSummary[]>(
  localized(`${previewRoot(categorySlug)}/search?query=${encodeURIComponent(query)}`, locale),
  accessToken,
  { signal }
)
export const getViewerPreviewArticle = (
  categorySlug: string,
  articleSlug: string,
  accessToken: string,
  locale?: string,
  signal?: AbortSignal
) => apiRequest<ViewerArticle>(
  localized(`${previewRoot(categorySlug)}/articles/${encodeURIComponent(articleSlug)}`, locale),
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
