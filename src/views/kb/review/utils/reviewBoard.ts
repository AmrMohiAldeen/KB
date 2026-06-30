// Type Imports
import type { ReviewCard, ReviewColumnId } from '../../types/review'

export const getCardsForReviewColumn = (cards: ReviewCard[], columnId: ReviewColumnId) =>
  cards.filter(card => card.columnId === columnId)
