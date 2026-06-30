export type ArticleStatus =
  | 'Published'
  | 'Draft'
  | 'Submitted'
  | 'To Review'
  | 'In Review'
  | 'Changes Requested'
  | 'Approved'
  | 'Archived'

export type ArticleFilter = 'Everything' | ArticleStatus | 'Followed'

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
