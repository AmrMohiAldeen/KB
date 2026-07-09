// Type Imports
import type { ReviewColumnId } from '../types/review'

export const reviewColumns: Array<{ id: ReviewColumnId; title: string }> = [
  { id: 'requests', title: 'Article Requests' },
  { id: 'drafts', title: 'Draft Articles' },
  { id: 'review', title: 'Articles in Review' },
  { id: 'published', title: 'Published Articles' }
]
