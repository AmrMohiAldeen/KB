// Third-party Type Imports
import type { Content } from '@tiptap/core'

export type PublicArticleSummary = {
  id: string
  title: string
  slug: string
  categoryPath: string
  views: number
}

export type PublicArticleDetails = {
  title: string
  slug: string
  categoryPath: string
  updatedAt: string
  views: number
  content: Content
}
