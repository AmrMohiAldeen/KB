// Third-party Type Imports
import type { Content } from '@tiptap/core'

// Type Imports
import type { ArticleStatus } from './articles'

export type EditorArticleDraft = {
  articleId: string
  title: string
  slug: string
  categoryId: string
  categoryPath: string
  status: ArticleStatus
  versionLabel: string
  content?: Content
}
