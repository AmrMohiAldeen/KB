import type { ArticleStatus } from '@/types/apps/articleTypes'
import type {
  ArticleLifecycleAction,
  ArticlePermissionsResponse
} from '@/types/apps/articleLifecycleTypes'

export const getVisibleLifecycleActions = (
  status: ArticleStatus,
  permissions: ArticlePermissionsResponse
): ArticleLifecycleAction[] => {
  const actions: ArticleLifecycleAction[] = []

  if (status === 'Draft' && permissions.canSubmitForReview) actions.push('submitForReview')
  if (status === 'ChangesRequested' && permissions.canSubmitForReview) actions.push('resubmit')
  if ((status === 'SubmittedForReview' || status === 'Resubmitted') && permissions.canReview)
    actions.push('startReview')
  if (status === 'InReview' && permissions.canRequestChanges) actions.push('requestChanges')
  if (status === 'InReview' && permissions.canApprove) actions.push('reject')
  if (status === 'InReview' && permissions.canApprove) actions.push('approve')
  if (status === 'Approved' && permissions.canPublish) actions.push('publish')
  if (permissions.canOverrideWorkflow && permissions.workflowOverrideTargets.length) actions.push('override')
  if (permissions.canDelete) actions.push('archive')

  return actions
}

export const lifecycleActionLabels: Record<ArticleLifecycleAction, string> = {
  submitForReview: 'Submit for review',
  startReview: 'Start review',
  requestChanges: 'Request changes',
  resubmit: 'Resubmit for review',
  approve: 'Approve',
  reject: 'Reject',
  publish: 'Publish',
  override: 'Admin override',
  archive: 'Archive'
}
