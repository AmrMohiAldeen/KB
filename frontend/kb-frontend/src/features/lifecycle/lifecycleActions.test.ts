import { describe, expect, it } from 'vitest'
import type { ArticlePermissionsResponse, ArticleReviewEventResponse } from '@/types/apps/articleLifecycleTypes'
import { getActiveChangeRequest, getVisibleLifecycleActions, lifecycleTargetActionLabel } from './lifecycleActions'

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

describe('active change request', () => {
  const request = (createdAt: string, comment: string): ArticleReviewEventResponse => ({
    reviewEventId: createdAt,
    articleId: 'article-1',
    draftId: 'draft-1',
    fromStatus: 'InReview',
    toStatus: 'ChangesRequested',
    action: 'RequestChanges',
    actor: { userId: 'reviewer-1', fullName: 'Amr Reviewer' },
    comment,
    createdAt
  })

  it('returns the latest saved request while the article is in Changes Requested', () => {
    const latest = request('2026-08-09T10:00:00Z', 'Add a troubleshooting example.')
    const earlier = request('2026-08-08T10:00:00Z', 'Clarify the introduction.')

    expect(getActiveChangeRequest('ChangesRequested', [earlier, latest])).toBe(latest)
  })

  it('hides the request once the article is submitted for review again', () => {
    expect(getActiveChangeRequest('SubmittedForReview', [
      request('2026-08-09T10:00:00Z', 'Add a troubleshooting example.')
    ])).toBeNull()
  })

  it('does not revive an old request if the article later returns to Changes Requested', () => {
    const oldRequest = request('2026-08-08T10:00:00Z', 'Add a troubleshooting example.')
    const submitted: ArticleReviewEventResponse = {
      ...oldRequest,
      reviewEventId: 'submitted',
      fromStatus: 'ChangesRequested',
      toStatus: 'SubmittedForReview',
      action: 'SubmitForReview',
      comment: null,
      createdAt: '2026-08-09T10:00:00Z'
    }

    expect(getActiveChangeRequest('ChangesRequested', [oldRequest, submitted])).toBeNull()
  })
})
