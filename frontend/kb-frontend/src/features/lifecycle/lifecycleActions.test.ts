import { describe, expect, it } from 'vitest'
import type { ArticlePermissionsResponse } from '@/types/apps/articleLifecycleTypes'
import { getVisibleLifecycleActions, lifecycleTargetActionLabel } from './lifecycleActions'

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
  it('uses the same submit action for new and changes-requested drafts', () => {
    const allowed = permissions({ canSubmitForReview: true })

    expect(getVisibleLifecycleActions('Draft', allowed)).toEqual(['submitForReview'])
    expect(getVisibleLifecycleActions('ChangesRequested', allowed)).toEqual(['submitForReview'])
    expect(getVisibleLifecycleActions('InReview', allowed)).toEqual([])
  })

  it('shows reviewer actions without exposing approval when the backend denies it', () => {
    expect(getVisibleLifecycleActions('SubmittedForReview', permissions({ canReview: true })))
      .toEqual([])
    expect(getVisibleLifecycleActions('SubmittedForReview', permissions({
      canReview: true,
      canRequestChanges: true,
      canApprove: true
    }))).toEqual(['requestChanges', 'approve'])
    expect(getVisibleLifecycleActions('InReview', permissions({
      canRequestChanges: true,
      canApprove: false
    }))).toEqual(['requestChanges'])
    expect(getVisibleLifecycleActions('InReview', permissions({
      canRequestChanges: true,
      canApprove: true
    }))).toEqual(['requestChanges', 'approve'])
  })

  it('keeps publish and admin targets in the status control while archive stays a secondary action', () => {
    expect(getVisibleLifecycleActions('Approved', permissions({
      canPublish: true,
      canDelete: true,
      canOverrideWorkflow: true,
      workflowOverrideTargets: ['Draft']
    }))).toEqual(['publish', 'override'])
  })

  it('uses concise user-facing labels for backend-authorized status targets', () => {
    expect(lifecycleTargetActionLabel.ChangesRequested).toBe('Request changes')
    expect(lifecycleTargetActionLabel.Approved).toBe('Approve')
    expect(lifecycleTargetActionLabel.InReview).toBe('Submit for review')
    expect(Object.values(lifecycleTargetActionLabel).some(label => label.startsWith('Move to'))).toBe(false)
  })
})
