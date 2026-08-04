// MUI Type Imports
import type { ChipProps } from '@mui/material/Chip'

// Type Imports
import type { ArticleFilter, ArticleStatus } from '../types/articles'

export const articleFilterLabels: ArticleFilter[] = [
  'Everything',
  'Published',
  'Draft',
  'SubmittedForReview',
  'InReview',
  'ChangesRequested',
  'Resubmitted',
  'Approved'
]

export const articleStatuses: ArticleStatus[] = [
  'Draft',
  'SubmittedForReview',
  'InReview',
  'ChangesRequested',
  'Resubmitted',
  'Approved',
  'Published',
  'Archived'
]

export const articleStatusColor: Record<ArticleStatus, ChipProps['color']> = {
  Published: 'success',
  Draft: 'secondary',
  SubmittedForReview: 'info',
  InReview: 'warning',
  ChangesRequested: 'warning',
  Resubmitted: 'info',
  Approved: 'success',
  Archived: 'secondary'
}

export const articleStatusLabel: Record<ArticleStatus, string> = {
  Draft: 'Draft',
  SubmittedForReview: 'Submitted for Review',
  InReview: 'In Review',
  ChangesRequested: 'Changes Requested',
  Resubmitted: 'Resubmitted',
  Approved: 'Approved',
  Published: 'Published',
  Archived: 'Archived'
}
