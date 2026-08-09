import type { ArticleVersionSummaryResponse } from '@/types/apps/articleLifecycleTypes'

export const snapshotReasonLabel: Record<ArticleVersionSummaryResponse['snapshotReason'], string> = {
  SubmittedForReview: 'Submitted for review',
  Approved: 'Approved',
  Published: 'Published'
}

export const formatVersionDate = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))

export const versionLabel = (version: Pick<ArticleVersionSummaryResponse, 'versionNumber'>) =>
  `Version ${version.versionNumber}`
