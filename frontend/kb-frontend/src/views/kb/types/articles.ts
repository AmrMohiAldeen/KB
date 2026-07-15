// Type Imports
import type { ArticleStatus as ApiArticleStatus } from '@/types/apps/articleTypes'

export type ArticleStatus = ApiArticleStatus

export type ArticleFilter = 'Everything' | ArticleStatus

export type KbArticle = {
  id: string
  title: string
  slug: string
  categoryId: string
  categoryPath: string
  status: ArticleStatus
  ownerName: string
  updatedAt: string
  views: number
  versionLabel: string
  followed: boolean
}

export type KbListRow =
  | {
      kind: 'category'
      id: string
      name: string
      articleCount: number
      statusCounts: Record<ArticleStatus, number>
      updatedAt: string
    }
  | {
      kind: 'article'
      article: KbArticle
    }
