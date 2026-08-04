import { describe, expect, it } from 'vitest'
import type { ArticlePermissionsResponse } from '@/types/apps/articleLifecycleTypes'
import { getVisibleLifecycleActions } from './lifecycleActions'

const permissions = (
  overrides: Partial<ArticlePermissionsResponse> = {}
): ArticlePermissionsResponse => ({
  canEdit: false,
  canSubmitForReview: false,
  canReview: false,
  canRequestChanges: false,
  canApprove: false,
  canPublish: false,
  canDelete: false,
  canViewVersionHistory: false,
  canRestoreVersion: false,
  canLock: false,
  canUnlock: false,
  canComment: false,
  canSuggest: false,
  canOverrideWorkflow: false,
  workflowOverrideTargets: [],
  ...overrides
})

describe('lifecycle action visibility', () => {
  it('shows author submission and resubmission only in their backend-authorized states', () => {
    const allowed = permissions({ canSubmitForReview: true })

    expect(getVisibleLifecycleActions('Draft', allowed)).toEqual(['submitForReview'])
    expect(getVisibleLifecycleActions('ChangesRequested', allowed)).toEqual(['resubmit'])
    expect(getVisibleLifecycleActions('InReview', allowed)).toEqual([])
  })

  it('shows reviewer actions without exposing approval when the backend denies it', () => {
    expect(getVisibleLifecycleActions('SubmittedForReview', permissions({ canReview: true })))
      .toEqual(['startReview'])
    expect(getVisibleLifecycleActions('SubmittedForReview', permissions({
      canReview: true,
      canRequestChanges: true,
      canApprove: true
    }))).toEqual(['startReview', 'requestChanges', 'reject', 'approve'])
    expect(getVisibleLifecycleActions('InReview', permissions({
      canRequestChanges: true,
      canApprove: false
    }))).toEqual(['requestChanges'])
    expect(getVisibleLifecycleActions('InReview', permissions({
      canRequestChanges: true,
      canApprove: true
    }))).toEqual(['requestChanges', 'reject', 'approve'])
  })

  it('shows publish, override, and archive only from explicit backend flags', () => {
    expect(getVisibleLifecycleActions('Approved', permissions({
      canPublish: true,
      canDelete: true,
      canOverrideWorkflow: true,
      workflowOverrideTargets: ['Draft']
    }))).toEqual(['publish', 'override', 'archive'])
  })
})
