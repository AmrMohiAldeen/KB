'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  Activity,
  Archive,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  Copy,
  FileClock,
  FilePenLine,
  FilePlus2,
  MoreVertical,
  RotateCcw,
  Save,
  Send,
  Trash2,
  Upload
} from 'lucide-react'
import CustomTextField from '@core/components/mui/TextField'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import { articleStatusLabel } from '@/views/kb/config/articles'
import type { ArticleLifecycleAction } from '@/types/apps/articleLifecycleTypes'
import type { ArticleStatus } from '@/types/apps/articleTypes'
import {
  getVisibleLifecycleActions,
  getActiveChangeRequest,
  lifecycleActionLabels,
  lifecycleTargetActionLabel
} from './lifecycleActions'
import { useArticleLifecycle, type ArticleLifecycleApi } from './useArticleLifecycle'
import ArticleActivityDrawer from './ArticleActivityDrawer'
import WorkflowRecipientDialog from './WorkflowRecipientDialog'
import { getArticleNotificationPreference, setArticleNotificationPreference } from '@/lib/api/notificationsApi'

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
  actionsTarget?: HTMLElement | null
  savedAt?: string | null
  saveLabel?: string
  onSaveDraft?: () => void
  saveDisabled?: boolean
  onVersions?: () => void
  onDuplicate?: () => void
  onDiscard?: () => void
  secondaryBusy?: boolean
  locale?: string
}

const actionIcons: Partial<Record<ArticleLifecycleAction, typeof Send>> = {
  submitForReview: Send,
  requestChanges: RotateCcw,
  approve: Check,
  publish: Upload
}

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()

export default function ArticleLifecyclePanel({
  articleId,
  accessToken,
  api,
  beforeAction,
  onArchived,
  onChanged,
  actionsDisabled = false,
  actionsDisabledReason,
  actionsTarget,
  savedAt,
  saveLabel = 'Saved',
  onSaveDraft,
  saveDisabled = false,
  onVersions,
  onDuplicate,
  onDiscard,
  secondaryBusy = false,
  locale = 'en'
}: ArticleLifecyclePanelProps) {
  const lifecycle = useArticleLifecycle({ articleId, accessToken, api, beforeAction, onArchived, onChanged })
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [reason, setReason] = useState('')
  const [targetStatus, setTargetStatus] = useState<ArticleStatus | ''>('')
  const [localError, setLocalError] = useState('')
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [recipientAction, setRecipientAction] = useState<{
    action: ArticleLifecycleAction
    targetStatus?: ArticleStatus
  } | null>(null)
  const [actionRecipientIds, setActionRecipientIds] = useState<string[]>([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const busy = lifecycle.pendingAction !== null || secondaryBusy
  const visibleActions = useMemo(
    () => lifecycle.article && lifecycle.permissions
      ? getVisibleLifecycleActions(
          lifecycle.article.currentDraft?.status ?? lifecycle.article.status,
          lifecycle.permissions
        )
      : [],
    [lifecycle.article, lifecycle.permissions]
  )
  const directActions = visibleActions.filter(action => action !== 'override')
  const workflowStatus = lifecycle.article?.currentDraft?.status ?? lifecycle.article?.status
  const overrideTargets = visibleActions.includes('override')
    ? (lifecycle.permissions?.workflowOverrideTargets ?? []).filter(target => target !== workflowStatus)
    : []

  const displayedOverrideTargets = overrideTargets.filter((target, index, targets) => {
    const label = lifecycleTargetActionLabel[target]
    return !directActions.some(action => lifecycleActionLabels[action] === label) &&
      targets.findIndex(item => lifecycleTargetActionLabel[item] === label) === index
  })

  const resetDialog = () => {
    if (busy) return
    setDialog(null)
    setReason('')
    setTargetStatus('')
    setActionRecipientIds([])
    setLocalError('')
  }

  const runAction = (action: ArticleLifecycleAction, additionalRecipientIds: string[] = []) => {
    setStatusAnchor(null)
    setMoreAnchor(null)
    setActionRecipientIds(additionalRecipientIds)
    if (action === 'requestChanges' || action === 'publish') {
      setDialog(action)
      setLocalError('')
      return
    }
    void lifecycle.run(action, { additionalRecipientIds })
  }

  const chooseOverrideTarget = (status: ArticleStatus, additionalRecipientIds: string[] = []) => {
    setStatusAnchor(null)
    setTargetStatus(status)
    setReason('')
    setActionRecipientIds(additionalRecipientIds)
    setLocalError('')
    setDialog('override')
  }

  const confirmDialog = async () => {
    if (!dialog) return
    if ((dialog === 'requestChanges' || dialog === 'override') && !reason.trim()) {
      setLocalError(dialog === 'requestChanges'
        ? 'A reason is required when requesting changes.'
        : 'A reason is required for this workflow change.')
      return
    }
    const result = await lifecycle.run(dialog, {
      comment: reason,
      targetStatus: targetStatus || undefined,
      additionalRecipientIds: actionRecipientIds
    })
    if (result || dialog === 'archive') resetDialog()
  }

  const chooseAdditionalRecipients = (action: ArticleLifecycleAction, target?: ArticleStatus) => {
    setStatusAnchor(null)
    setMoreAnchor(null)
    setRecipientAction({ action, targetStatus: target })
  }

  const confirmAdditionalRecipients = (userIds: string[]) => {
    const selectedAction = recipientAction
    setRecipientAction(null)
    if (!selectedAction) return
    if (selectedAction.action === 'override' && selectedAction.targetStatus) {
      chooseOverrideTarget(selectedAction.targetStatus, userIds)
      return
    }
    runAction(selectedAction.action, userIds)
  }

  useEffect(() => {
    const controller = new AbortController()
    getArticleNotificationPreference(articleId, accessToken, controller.signal)
      .then(result => setNotificationsEnabled(result.enabled))
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setNotificationError('Notification preference could not be loaded.')
      })
    return () => controller.abort()
  }, [accessToken, articleId])

  const toggleNotifications = async () => {
    const next = !notificationsEnabled
    setNotificationSaving(true)
    setNotificationError('')
    try {
      const result = await setArticleNotificationPreference(articleId, next, accessToken)
      setNotificationsEnabled(result.enabled)
    } catch {
      setNotificationError('Notification preference could not be saved.')
    } finally {
      setNotificationSaving(false)
    }
  }

  const article = lifecycle.article
  const status = article?.status
  const ownerName = article?.owner.fullName || 'Article author'
  const ownerLabel = 'Author'
  const formattedSavedAt = savedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt))
    : null
  const statusColor = workflowStatus === 'Published' || workflowStatus === 'Approved'
    ? 'success'
    : workflowStatus === 'SubmittedForReview'
      ? 'info'
      : workflowStatus === 'InReview' || workflowStatus === 'ChangesRequested'
        ? 'warning'
        : 'secondary'
  const activeChangeRequest = getActiveChangeRequest(workflowStatus, lifecycle.reviewHistory)
  const publishedVersionId = article?.currentPublishedVersion?.versionId
  const changeRequestedAt = activeChangeRequest
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
        .format(new Date(activeChangeRequest.createdAt))
    : null

  const toolbar = (
    <Stack
      direction='row'
      spacing={1.25}
      useFlexGap
      sx={{ inlineSize: '100%', alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Tooltip title={`${ownerLabel}: ${ownerName}`}>
        <Avatar sx={{ inlineSize: 36, blockSize: 36, fontSize: 13, fontWeight: 700, bgcolor: 'primary.main' }}>
          {initials(ownerName)}
        </Avatar>
      </Tooltip>

      {status === 'Published' && workflowStatus !== 'Published' && (
        <Chip size='small' color='success' variant='tonal' label='Published version live' />
      )}

      <Button
        variant='tonal'
        color={status ? statusColor : 'inherit'}
        endIcon={lifecycle.loading ? <CircularProgress size={14} /> : <ChevronDown size={15} />}
        disabled={!workflowStatus || busy || actionsDisabled}
        onClick={event => setStatusAnchor(event.currentTarget)}
        sx={{ minInlineSize: 150, justifyContent: 'space-between', textTransform: 'none', fontWeight: 700 }}
      >
        {workflowStatus
          ? `${status === 'Published' ? 'Draft: ' : ''}${articleStatusLabel[workflowStatus]}`
          : 'Loading status'}
      </Button>
      <Menu anchorEl={statusAnchor} open={Boolean(statusAnchor)} onClose={() => setStatusAnchor(null)}>
        <MenuItem selected disabled sx={{ opacity: '1 !important', fontWeight: 700 }}>
          <ListItemIcon><Check size={17} /></ListItemIcon>
          <ListItemText
            primary={workflowStatus ? articleStatusLabel[workflowStatus] : ''}
            secondary={status === 'Published' ? 'Current draft status' : 'Current status'}
          />
        </MenuItem>
        <Divider />
        {directActions.map(action => {
          const Icon = actionIcons[action]
          return (
            <MenuItem key={action} onClick={() => runAction(action)}>
              {Icon && <ListItemIcon><Icon size={17} /></ListItemIcon>}
              <ListItemText>{lifecycleActionLabels[action]}</ListItemText>
              <Tooltip title={`Notify additional users for ${lifecycleActionLabels[action]}`}>
                <IconButton
                  edge='end'
                  size='small'
                  aria-label={`Choose additional recipients for ${lifecycleActionLabels[action]}`}
                  onClick={event => {
                    event.stopPropagation()
                    chooseAdditionalRecipients(action)
                  }}
                >
                  <MoreVertical size={16} />
                </IconButton>
              </Tooltip>
            </MenuItem>
          )
        })}
        {displayedOverrideTargets.map(target => (
          <MenuItem key={target} onClick={() => chooseOverrideTarget(target)}>
            <ListItemIcon><RotateCcw size={17} /></ListItemIcon>
            <ListItemText>{lifecycleTargetActionLabel[target]}</ListItemText>
            <Tooltip title={`Notify additional users for ${lifecycleTargetActionLabel[target]}`}>
              <IconButton
                edge='end'
                size='small'
                aria-label={`Choose additional recipients for ${lifecycleTargetActionLabel[target]}`}
                onClick={event => {
                  event.stopPropagation()
                  chooseAdditionalRecipients('override', target)
                }}
              >
                <MoreVertical size={16} />
              </IconButton>
            </Tooltip>
          </MenuItem>
        ))}
        {directActions.length === 0 && displayedOverrideTargets.length === 0 && (
          <MenuItem disabled>No transitions available</MenuItem>
        )}
      </Menu>

      {status === 'Published' && workflowStatus === 'Approved' &&
        !lifecycle.permissions?.canPublish && lifecycle.permissions?.canRestoreVersion && publishedVersionId && (
        <Button
          variant='contained'
          startIcon={lifecycle.pendingAction === 'restore'
            ? <CircularProgress size={14} color='inherit' />
            : <FilePenLine size={16} />}
          disabled={busy || actionsDisabled}
          onClick={() => void lifecycle.restore(publishedVersionId)}
        >
          Start new draft
        </Button>
      )}

      <Tooltip title='More actions'>
        <IconButton aria-label='More actions' onClick={event => setMoreAnchor(event.currentTarget)}>
          <MoreVertical size={20} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
        <MenuItem disabled={saveDisabled || busy} onClick={() => { setMoreAnchor(null); onSaveDraft?.() }}>
          <ListItemIcon><Save size={17} /></ListItemIcon><ListItemText>Save draft</ListItemText>
        </MenuItem>
        <Tooltip title='Template creation is not exposed by the current KB API.' placement='left'>
          <span><MenuItem disabled><ListItemIcon><FilePlus2 size={17} /></ListItemIcon><ListItemText>Save as template</ListItemText></MenuItem></span>
        </Tooltip>
        {lifecycle.permissions?.canDelete && (
          <MenuItem onClick={() => runAction('archive')}>
            <ListItemIcon><Archive size={17} /></ListItemIcon><ListItemText>Archive article</ListItemText>
            <Tooltip title='Notify additional users for Archive article'>
              <IconButton
                edge='end'
                size='small'
                aria-label='Choose additional recipients for Archive article'
                onClick={event => {
                  event.stopPropagation()
                  chooseAdditionalRecipients('archive')
                }}
              >
                <MoreVertical size={16} />
              </IconButton>
            </Tooltip>
          </MenuItem>
        )}
        {lifecycle.permissions?.canViewVersionHistory && onVersions && (
          <MenuItem onClick={() => { setMoreAnchor(null); onVersions() }}>
            <ListItemIcon><FileClock size={17} /></ListItemIcon><ListItemText>Versions</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMoreAnchor(null); setActivityOpen(true) }}>
          <ListItemIcon><Activity size={17} /></ListItemIcon><ListItemText>Revision history</ListItemText>
        </MenuItem>
        {onDuplicate && (
          <MenuItem onClick={() => { setMoreAnchor(null); onDuplicate() }}>
            <ListItemIcon><Copy size={17} /></ListItemIcon><ListItemText>Duplicate</ListItemText>
          </MenuItem>
        )}
        {onDiscard && (
          <MenuItem disabled={saveDisabled || busy} onClick={() => { setMoreAnchor(null); onDiscard() }}>
            <ListItemIcon><Trash2 size={17} /></ListItemIcon><ListItemText>Discard local changes</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Box sx={{ flex: 1, minInlineSize: { xs: '100%', sm: 24 } }} />
      <Box sx={{ textAlign: { xs: 'start', sm: 'end' }, minInlineSize: 130 }}>
        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', lineHeight: 1.2 }}>Last saved</Typography>
        <Typography variant='body2' sx={{ fontWeight: 600 }}>
          {saveLabel === 'Saved' && formattedSavedAt ? formattedSavedAt : saveLabel}
        </Typography>
      </Box>

      <Tooltip title={notificationsEnabled ? 'Article notifications on' : 'Article notifications off'}>
        <IconButton aria-label='Article notifications' color={notificationsEnabled ? 'primary' : 'default'} onClick={event => setNotificationAnchor(event.currentTarget)}>
          {notificationsEnabled ? <Bell size={19} /> : <BellOff size={19} />}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={notificationAnchor} open={Boolean(notificationAnchor)} onClose={() => setNotificationAnchor(null)}>
        <MenuItem disabled={notificationSaving} onClick={() => void toggleNotifications()}>
          <ListItemIcon>{notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}</ListItemIcon>
          <ListItemText primary='Article notifications' secondary={notificationsEnabled ? 'Enabled for this article' : 'Disabled for this article'} />
          <Switch edge='end' checked={notificationsEnabled} tabIndex={-1} />
        </MenuItem>
        {notificationError && <MenuItem disabled><ListItemText secondary={notificationError} /></MenuItem>}
      </Menu>

      <Tooltip title='Revision history'>
        <IconButton aria-label='Revision history' onClick={() => setActivityOpen(true)}><Activity size={19} /></IconButton>
      </Tooltip>

      {activeChangeRequest && (
        <Alert severity='warning' variant='outlined' sx={{ flexBasis: '100%', inlineSize: '100%', mt: 0.5 }}>
          <AlertTitle sx={{ fontWeight: 700 }}>Changes requested</AlertTitle>
          <Typography variant='body2' sx={{ whiteSpace: 'pre-wrap' }}>
            {activeChangeRequest.comment}
          </Typography>
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.75 }}>
            Requested by {activeChangeRequest.actor.fullName}{changeRequestedAt ? ` · ${changeRequestedAt}` : ''}
          </Typography>
        </Alert>
      )}
    </Stack>
  )

  return (
    <>
      {actionsTarget ? createPortal(toolbar, actionsTarget) : toolbar}
      {(lifecycle.messages.length > 0 || lifecycle.successMessage || lifecycle.conflict ||
        (actionsDisabled && actionsDisabledReason)) && (
        <Stack spacing={1.5}>
          <KbValidationSummary title='Lifecycle action could not be completed' errors={lifecycle.messages} />
          {lifecycle.successMessage && <Alert severity='success'>{lifecycle.successMessage}</Alert>}
          {lifecycle.conflict && <Alert severity='warning'>The article changed. Reload it before retrying the transition.</Alert>}
          {actionsDisabled && actionsDisabledReason && <Alert severity='info'>{actionsDisabledReason}</Alert>}
        </Stack>
      )}

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
          <CustomTextField fullWidth multiline minRows={4} label='Required reason' value={reason} onChange={event => { setReason(event.target.value); setLocalError('') }} />
        </Stack>
      </KbFormDialog>

      <KbFormDialog
        open={dialog === 'override'}
        title={targetStatus ? lifecycleTargetActionLabel[targetStatus] : 'Change article status'}
        description='This transition is available through your existing workflow permissions. Record why the state is changing.'
        submitLabel={targetStatus ? lifecycleTargetActionLabel[targetStatus] : 'Change status'}
        submitting={busy}
        onClose={resetDialog}
        onSubmit={() => void confirmDialog()}
      >
        <Stack spacing={2}>
          {localError && <Alert severity='error'>{localError}</Alert>}
          <CustomTextField fullWidth multiline minRows={3} label='Required reason' value={reason} onChange={event => { setReason(event.target.value); setLocalError('') }} />
        </Stack>
      </KbFormDialog>

      <KbConfirmDialog open={dialog === 'publish'} title='Publish approved article?' description='The approved submitted version will replace the currently published version. Publishing does not create a duplicate version.' confirmLabel='Publish' submitting={busy} onClose={resetDialog} onConfirm={() => void confirmDialog()} />
      <KbConfirmDialog open={dialog === 'archive'} title='Archive article?' description='The article will be removed from active results.' confirmLabel='Archive' confirmColor='error' submitting={busy} onClose={resetDialog} onConfirm={() => void confirmDialog()} />
      <WorkflowRecipientDialog
        open={Boolean(recipientAction)}
        actionLabel={recipientAction?.targetStatus
          ? lifecycleTargetActionLabel[recipientAction.targetStatus]
          : recipientAction ? lifecycleActionLabels[recipientAction.action] : 'Workflow'}
        accessToken={accessToken}
        onClose={() => setRecipientAction(null)}
        onConfirm={confirmAdditionalRecipients}
      />
      <ArticleActivityDrawer articleId={articleId} accessToken={accessToken} open={activityOpen} onClose={() => setActivityOpen(false)} locale={locale} />
    </>
  )
}
