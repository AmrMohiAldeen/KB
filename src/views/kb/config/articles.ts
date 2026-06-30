// MUI Type Imports
import type { ChipProps } from '@mui/material/Chip'

// Type Imports
import type { ArticleFilter, ArticleStatus } from '../types/articles'

export const articleFilterLabels: ArticleFilter[] = [
  'Everything',
  'Published',
  'Draft',
  'To Review',
  'Followed',
  'Archived'
]

export const articleStatuses: ArticleStatus[] = [
  'Draft',
  'Submitted',
  'In Review',
  'Changes Requested',
  'Approved',
  'Published',
  'Archived'
]

export const articleStatusColor: Record<ArticleStatus, ChipProps['color']> = {
  Published: 'success',
  Draft: 'secondary',
  Submitted: 'info',
  'To Review': 'warning',
  'In Review': 'warning',
  'Changes Requested': 'warning',
  Approved: 'success',
  Archived: 'secondary'
}
