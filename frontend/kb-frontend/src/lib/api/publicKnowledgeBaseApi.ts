import type { Content } from '@tiptap/core'
import { publicApiRequest } from './http'

export type PublicCategoryNode = {
  categoryId: string
  parentCategoryId: string | null
  name: string
  slug: string
  description: string | null
  sortOrder: number
  path: string | null
  depth: number
  articleCount: number
  children: PublicCategoryNode[]
}

export type PublicArticleSummary = {
  articleId: string
  title: string
  slug: string
  categoryId: string
  categoryName: string
  categoryPath: string
  updatedAt: string
}

export type PublicArticle = PublicArticleSummary & { content: Content }

export const getPublicCategories = (signal?: AbortSignal) =>
  publicApiRequest<PublicCategoryNode[]>('/api/public/kb/categories/tree', { signal })

export const getPublicArticles = (search?: string, signal?: AbortSignal) => {
  const params = new URLSearchParams()
  if (search?.trim()) params.set('search', search.trim())
  const suffix = params.size ? `?${params}` : ''
  return publicApiRequest<PublicArticleSummary[]>(`/api/public/kb/articles${suffix}`, { signal })
}

export const getPublicArticle = (slug: string, signal?: AbortSignal) =>
  publicApiRequest<PublicArticle>(`/api/public/kb/articles/${encodeURIComponent(slug)}`, { signal })
