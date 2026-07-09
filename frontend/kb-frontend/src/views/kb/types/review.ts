// Type Imports
import type { ArticleStatus } from './articles'

export type ReviewColumnId = 'requests' | 'drafts' | 'review' | 'published'

export type ReviewCard = {
  id: string
  title: string
  ownerName: string
  status: ArticleStatus | 'Request'
  updatedAt: string
  columnId: ReviewColumnId
}
