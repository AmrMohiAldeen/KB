'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import {
  Archive,
  Check,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Upload
} from 'lucide-react'
import CustomTextField from '@core/components/mui/TextField'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import StatusChip from '@/views/kb/shared/components/StatusChip'
import { articleStatusColor, articleStatusLabel } from '@/views/kb/config/articles'
import { formatDate } from '@/views/kb/shared/utils/formatDate'
import type { ArticleLifecycleAction } from '@/types/apps/articleLifecycleTypes'
import type { ArticleStatus } from '@/types/apps/articleTypes'
import { getVisibleLifecycleActions, lifecycleActionLabels } from './lifecycleActions'
import { useArticleLifecycle, type ArticleLifecycleApi } from './useArticleLifecycle'

type DialogKind = 'requestChanges' | 'publish' | 'override' | 'archive' | null

type ArticleLifecyclePanelProps = {
  articleId: string
  accessToken: string
  api?: ArticleLifecycleApi
  beforeAction?: () => Promise<boolean>
  onArchived?: () => void
  onChanged?: () => void
  actionsDisabled?: boolean
  actionsDisabledReason?: string
  compact?: boolean
  actionsTarget?: HTMLElement | null
  actionsInHeader?: boolean
}

const actionIcons: Record<ArticleLifecycleAction, typeof Send> = {
  submitForReview: Send,
  startReview: Play,
  requestChanges: RotateCcw,
  resubmit: Send,
  approve: Check,
  publish: Upload,
  override: ShieldAlert,
  archive: Archive
}

export default function ArticleLifecyclePanel({
  articleId,
  accessToken,
  api,
  beforeAction,
  onArchived,
  onChanged,
  actionsDisabled = false,
  actionsDisabledReason,
  compact = false,
  actionsTarget,
  actionsInHeader = false
}: ArticleLifecyclePanelProps) {
  const lifecycle = useArticleLifecycle({ articleId, accessToken, api, beforeAction, onArchived, onChanged })
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [reason, setReason] = useState('')
  const [targetStatus, setTargetStatus] = useState<ArticleStatus | ''>('')
  const [localError, setLocalError] = useState('')
  const busy = lifecycle.pendingAction !== null
  const visibleActions = useMemo(
    () => lifecycle.article && lifecycle.permissions
      ? getVisibleLifecycleActions(lifecycle.article.status, lifecycle.permissions)
      : [],
    [lifecycle.article, lifecycle.permissions]
  )

  const resetDialog = () => {
    if (busy) return
    setDialog(null)
    setReason('')
    setTargetStatus('')
    setLocalError('')
  }

  const runAction = (action: ArticleLifecycleAction) => {
    if (action === 'requestChanges' || action === 'publish' || action === 'override' || action === 'archive') {
      setDialog(action)
      setLocalError('')
      return
    }
    void lifecycle.run(action)
  }

  const confirmDialog = async () => {
    if (!dialog) return
    if ((dialog === 'requestChanges' || dialog === 'override') && !reason.trim()) {
      setLocalError(dialog === 'requestChanges'
        ? 'A reason is required when requesting changes.'
        : 'An override reason is required.')
      return
    }
    if (dialog === 'override' && !targetStatus) {
      setLocalError('Select the target lifecycle status.')
      return
    }
    const result = await lifecycle.run(dialog, {
      comment: reason,
      targetStatus: targetStatus || undefined
    })
    if (result || dialog === 'archive') resetDialog()
  }

  if (lifecycle.loading && !lifecycle.article) {
    return (
      <Card variant='outlined'>
        <CardContent>
          <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
            <CircularProgress size={20} />
            <Typography>Loading lifecycle…</Typography>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  const article = lifecycle.article
  const publishedAlongsideDraft = article?.currentPublishedVersion && article.status !== 'Published'
  const actionButtons = visibleActions.map(action => {
    const Icon = actionIcons[action]

    return (
      <Button
        key={action}
        size={compact ? 'small' : 'medium'}
        variant={action === 'submitForReview' || action === 'approve' || action === 'publish' ? 'contained' : 'outlined'}
        color={action === 'archive' ? 'error' : action === 'requestChanges' ? 'warning' : 'primary'}
        startIcon={<Icon size={17} />}
        loading={lifecycle.pendingAction === action}
        disabled={busy || actionsDisabled}
        onClick={() => runAction(action)}
      >
        {lifecycleActionLabels[action]}
      </Button>
    )
  })

  return (
    <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}>
      <CardContent sx={{ p: compact ? 3 : 4, '&:last-child': { pb: compact ? 3 : 4 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack direction='row' spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant={compact ? 'subtitle1' : 'h6'} sx={{ fontWeight: 700 }}>
                Lifecycle
              </Typography>
              {article && (
                <StatusChip
                  label={articleStatusLabel[article.status]}
                  color={articleStatusColor[article.status]}
                />
              )}
            </Stack>
            <Button
              size='small'
              variant='text'
              startIcon={<RefreshCw size={16} />}
              disabled={busy}
              onClick={lifecycle.reload}
            >
              Reload
            </Button>
          </Stack>

          <KbValidationSummary title='Lifecycle action could not be completed' errors={lifecycle.messages} />
          {lifecycle.conflict && (
            <Alert
              severity='warning'
              action={<Button color='inherit' size='small' onClick={lifecycle.reload}>Reload article</Button>}
            >
              The article changed after it was loaded. Reload the current article and workflow state before retrying.
            </Alert>
          )}
          {lifecycle.successMessage && <Alert severity='success'>{lifecycle.successMessage}</Alert>}
          {publishedAlongsideDraft && (
            <Alert severity='info'>
              Published version {article.currentPublishedVersion!.versionNumber} remains visible to readers while the newer
              {' '}{articleStatusLabel[article.status].toLowerCase()} draft moves through review.
            </Alert>
          )}
          {actionsDisabled && actionsDisabledReason && <Alert severity='info'>{actionsDisabledReason}</Alert>}

          {!actionsInHeader && visibleActions.length > 0 ? (
            <Stack direction='row' spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {actionButtons}
            </Stack>
          ) : !actionsInHeader && (
            <Typography variant='body2' color='text.secondary'>
              No lifecycle actions are currently available to you.
            </Typography>
          )}

          {!compact && (
            <>
              <Divider />
              <Box>
                <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
                  <History size={18} />
                  <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Review history</Typography>
                </Stack>
                {lifecycle.reviewHistory.length ? (
                  <Stack spacing={2}>
                    {lifecycle.reviewHistory.map(event => (
                      <Box key={event.reviewEventId}>
                        <Typography variant='body2' color='text.primary' sx={{ fontWeight: 600 }}>
                          {event.actor.fullName} · {event.action}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {event.fromStatus ? `${articleStatusLabel[event.fromStatus]} → ` : ''}
                          {articleStatusLabel[event.toStatus]} · {formatDate(event.createdAt)}
                        </Typography>
                        {event.comment && (
                          <Typography variant='body2' sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>
                            {event.comment}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant='body2' color='text.secondary'>No review actions have been recorded.</Typography>
                )}
              </Box>

              {lifecycle.permissions?.canViewVersionHistory && (
                <>
                  <Divider />
                  <Box>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, mb: 2 }}>Version history</Typography>
                    {lifecycle.versions.length ? (
                      <Box sx={{ overflowX: 'auto' }}>
                        <Table size='small' aria-label='Article version history'>
                          <TableHead>
                            <TableRow>
                              <TableCell>Version</TableCell>
                              <TableCell>Reason</TableCell>
                              <TableCell>Author</TableCell>
                              <TableCell>Created</TableCell>
                              <TableCell>Status</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {lifecycle.versions.map(version => (
                              <TableRow key={version.versionId}>
                                <TableCell>v{version.versionNumber}</TableCell>
                                <TableCell>{version.snapshotReason}</TableCell>
                                <TableCell>{version.createdBy.fullName}</TableCell>
                                <TableCell>{formatDate(version.createdAt)}</TableCell>
                                <TableCell>{version.isPublished ? 'Published snapshot' : 'Workflow snapshot'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    ) : (
                      <Typography variant='body2' color='text.secondary'>No version snapshots exist yet.</Typography>
                    )}
                  </Box>
                </>
              )}
            </>
          )}
        </Stack>
      </CardContent>

      <KbFormDialog
        open={dialog === 'requestChanges'}
        title='Request changes'
        description='Explain what must change before this article can be approved.'
        submitLabel='Request changes'
        submitting={busy}
        onClose={resetDialog}
        onSubmit={() => void confirmDialog()}
      >
        <Stack spacing={2}>
          {localError && <Alert severity='error'>{localError}</Alert>}
          <CustomTextField
            fullWidth
            multiline
            minRows={4}
            label='Required reason'
            value={reason}
            error={Boolean(localError)}
            onChange={event => {
              setReason(event.target.value)
              setLocalError('')
            }}
          />
        </Stack>
      </KbFormDialog>

      <KbFormDialog
        open={dialog === 'override'}
        title='Confirm admin workflow override'
        description='This bypasses the normal transition path. Select a backend-authorized target and record why.'
        submitLabel='Apply override'
        submitting={busy}
        onClose={resetDialog}
        onSubmit={() => void confirmDialog()}
      >
        <Stack spacing={3}>
          {localError && <Alert severity='error'>{localError}</Alert>}
          <CustomTextField
            select
            fullWidth
            label='Target status'
            value={targetStatus}
            onChange={event => {
              setTargetStatus(event.target.value as ArticleStatus)
              setLocalError('')
            }}
          >
            {lifecycle.permissions?.workflowOverrideTargets.map(status => (
              <MenuItem key={status} value={status}>{articleStatusLabel[status]}</MenuItem>
            ))}
          </CustomTextField>
          <CustomTextField
            fullWidth
            multiline
            minRows={3}
            label='Required reason'
            value={reason}
            onChange={event => {
              setReason(event.target.value)
              setLocalError('')
            }}
          />
        </Stack>
      </KbFormDialog>

      <KbConfirmDialog
        open={dialog === 'publish'}
        title='Publish approved article?'
        description='The approved draft will become a new immutable published version visible to readers.'
        confirmLabel='Publish'
        submitting={busy}
        onClose={resetDialog}
        onConfirm={() => void confirmDialog()}
      />
      <KbConfirmDialog
        open={dialog === 'archive'}
        title='Archive article?'
        description='The article will be removed from active results. This action uses the current row version.'
        confirmLabel='Archive'
        confirmColor='error'
        submitting={busy}
        onClose={resetDialog}
        onConfirm={() => void confirmDialog()}
      />
      {actionsInHeader && actionsTarget && actionButtons.length > 0
        ? createPortal(<>{actionButtons}</>, actionsTarget)
        : null}
    </Card>
  )
}
