'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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
import { getVisibleLifecycleActions, lifecycleActionLabels } from './lifecycleActions'
import { useArticleLifecycle, type ArticleLifecycleApi } from './useArticleLifecycle'
import ArticleActivityDrawer from './ArticleActivityDrawer'
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
  onRevisionHistory?: () => void
  onDuplicate?: () => void
  onDiscard?: () => void
  secondaryBusy?: boolean
  locale?: string
}

const actionIcons: Partial<Record<ArticleLifecycleAction, typeof Send>> = {
  submitForReview: Send,
  requestChanges: RotateCcw,
  resubmit: Send,
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
  onRevisionHistory,
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const busy = lifecycle.pendingAction !== null || secondaryBusy
  const visibleActions = useMemo(
    () => lifecycle.article && lifecycle.permissions
      ? getVisibleLifecycleActions(lifecycle.article.status, lifecycle.permissions)
      : [],
    [lifecycle.article, lifecycle.permissions]
  )
  const directActions = visibleActions.filter(action => action !== 'override')
  const overrideTargets = visibleActions.includes('override')
    ? lifecycle.permissions?.workflowOverrideTargets ?? []
    : []

  const resetDialog = () => {
    if (busy) return
    setDialog(null)
    setReason('')
    setTargetStatus('')
    setLocalError('')
  }

  const runAction = (action: ArticleLifecycleAction) => {
    setStatusAnchor(null)
    if (action === 'requestChanges' || action === 'publish') {
      setDialog(action)
      setLocalError('')
      return
    }
    void lifecycle.run(action)
  }

  const chooseOverrideTarget = (status: ArticleStatus) => {
    setStatusAnchor(null)
    setTargetStatus(status)
    setReason('')
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
      targetStatus: targetStatus || undefined
    })
    if (result || dialog === 'archive') resetDialog()
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
  const ownerName = article?.owner.fullName ?? 'Article author'
  const formattedSavedAt = savedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(savedAt))
    : null

  const toolbar = (
    <Stack
      direction='row'
      spacing={1.25}
      useFlexGap
      sx={{ inlineSize: '100%', alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Tooltip title={`Author: ${ownerName}`}>
        <Avatar sx={{ inlineSize: 36, blockSize: 36, fontSize: 13, fontWeight: 700, bgcolor: 'primary.main' }}>
          {initials(ownerName)}
        </Avatar>
      </Tooltip>

      <Button
        variant='outlined'
        color='inherit'
        endIcon={lifecycle.loading ? <CircularProgress size={14} /> : <ChevronDown size={15} />}
        disabled={!status || busy || actionsDisabled}
        onClick={event => setStatusAnchor(event.currentTarget)}
        sx={{ minInlineSize: 150, justifyContent: 'space-between', textTransform: 'none', fontWeight: 700 }}
      >
        {status ? articleStatusLabel[status] : 'Loading status'}
      </Button>
      <Menu anchorEl={statusAnchor} open={Boolean(statusAnchor)} onClose={() => setStatusAnchor(null)}>
        <MenuItem disabled sx={{ opacity: '1 !important' }}>
          <ListItemText primary='Available transitions' secondary={`Current: ${status ? articleStatusLabel[status] : ''}`} />
        </MenuItem>
        <Divider />
        {directActions.map(action => {
          const Icon = actionIcons[action]
          return (
            <MenuItem key={action} onClick={() => runAction(action)}>
              {Icon && <ListItemIcon><Icon size={17} /></ListItemIcon>}
              <ListItemText>{lifecycleActionLabels[action]}</ListItemText>
            </MenuItem>
          )
        })}
        {overrideTargets.map(target => (
          <MenuItem key={target} onClick={() => chooseOverrideTarget(target)}>
            <ListItemIcon><RotateCcw size={17} /></ListItemIcon>
            <ListItemText>Move to {articleStatusLabel[target]}</ListItemText>
          </MenuItem>
        ))}
        {directActions.length === 0 && overrideTargets.length === 0 && (
          <MenuItem disabled>No transitions available</MenuItem>
        )}
      </Menu>

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
          <MenuItem onClick={() => { setMoreAnchor(null); setDialog('archive') }}>
            <ListItemIcon><Archive size={17} /></ListItemIcon><ListItemText>Archive article</ListItemText>
          </MenuItem>
        )}
        {lifecycle.permissions?.canViewVersionHistory && onRevisionHistory && (
          <MenuItem onClick={() => { setMoreAnchor(null); onRevisionHistory() }}>
            <ListItemIcon><FileClock size={17} /></ListItemIcon><ListItemText>Revision history</ListItemText>
          </MenuItem>
        )}
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

      <Tooltip title='Activity'>
        <IconButton aria-label='Article activity' onClick={() => setActivityOpen(true)}><Activity size={19} /></IconButton>
      </Tooltip>
    </Stack>
  )

  return (
    <>
      {actionsTarget ? createPortal(toolbar, actionsTarget) : toolbar}
      {(lifecycle.messages.length > 0 || lifecycle.conflict || (actionsDisabled && actionsDisabledReason)) && (
        <Stack spacing={1.5}>
          <KbValidationSummary title='Lifecycle action could not be completed' errors={lifecycle.messages} />
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
        title={`Move article to ${targetStatus ? articleStatusLabel[targetStatus] : 'selected status'}`}
        description='This transition is available through your existing workflow permissions. Record why the state is changing.'
        submitLabel={`Move to ${targetStatus ? articleStatusLabel[targetStatus] : 'status'}`}
        submitting={busy}
        onClose={resetDialog}
        onSubmit={() => void confirmDialog()}
      >
        <Stack spacing={2}>
          {localError && <Alert severity='error'>{localError}</Alert>}
          <CustomTextField fullWidth multiline minRows={3} label='Required reason' value={reason} onChange={event => { setReason(event.target.value); setLocalError('') }} />
        </Stack>
      </KbFormDialog>

      <KbConfirmDialog open={dialog === 'publish'} title='Publish approved article?' description='The approved draft will become a new immutable published version visible to readers.' confirmLabel='Publish' submitting={busy} onClose={resetDialog} onConfirm={() => void confirmDialog()} />
      <KbConfirmDialog open={dialog === 'archive'} title='Archive article?' description='The article will be removed from active results.' confirmLabel='Archive' confirmColor='error' submitting={busy} onClose={resetDialog} onConfirm={() => void confirmDialog()} />
      <ArticleActivityDrawer articleId={articleId} accessToken={accessToken} open={activityOpen} onClose={() => setActivityOpen(false)} locale={locale} />
    </>
  )
}
