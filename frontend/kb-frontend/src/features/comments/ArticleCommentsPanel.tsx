'use client'

import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { MessageSquarePlus, Pencil, RefreshCw, Trash2, X } from 'lucide-react'
import { ApiError, describeApiError } from '@/lib/api/http'
import type {
  ArticleComment,
  CommentAnchorData,
  CommentAnchorType
} from '@/types/apps/commentTypes'
import { useArticleComments } from './useArticleComments'

export type PendingCommentAnchor = {
  anchorType: CommentAnchorType
  anchorData: CommentAnchorData
}

type CommentState = ReturnType<typeof useArticleComments>

type ArticleCommentsPanelProps = {
  state: CommentState
  currentDraftId: string | null
  activeThreadId: string | null
  onActiveThreadChange: (threadId: string | null) => void
  pendingAnchor: PendingCommentAnchor | null
  onClearPendingAnchor: () => void
  locale?: string
  anchorPositions?: Record<string, number>
}

const anchorLabel = (comment: ArticleComment) => {
  if (!comment.anchorType || comment.anchorStatus !== 'Attached') return 'Article'
  return comment.anchorType === 'TextRange' ? 'Inline' : 'Block'
}

const mutationError = (state: CommentState): unknown =>
  state.create.error || state.reply.error || state.update.error ||
  state.remove.error || state.resolution.error

const CommentEntry = ({
  comment,
  state,
  locale
}: {
  comment: ArticleComment
  state: CommentState
  locale: string
}) => {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body ?? '')
  const deleted = Boolean(comment.deletedAt)

  const save = async () => {
    const value = body.trim()
    if (!value) return
    await state.update.mutateAsync({
      commentId: comment.commentId,
      body: value,
      rowVersion: comment.rowVersion
    })
    setEditing(false)
  }

  return (
    <Stack direction='row' spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 30, height: 30, fontSize: 12 }}>
        {comment.createdBy.fullName.split(/\s+/).map(value => value[0]).slice(0, 2).join('').toUpperCase()}
      </Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant='body2' sx={{ fontWeight: 700 }}>
              {comment.createdBy.fullName}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short'
              }).format(new Date(comment.createdAt))}
            </Typography>
          </Box>
          {!deleted && (
            <Stack direction='row' spacing={0.5}>
              {comment.canUpdate && (
                <Tooltip title='Edit comment'>
                  <IconButton size='small' onClick={() => {
                    setBody(comment.body ?? '')
                    setEditing(value => !value)
                  }}>
                    <Pencil size={14} />
                  </IconButton>
                </Tooltip>
              )}
              {comment.canDelete && (
                <Tooltip title='Delete comment'>
                  <IconButton
                    size='small'
                    color='error'
                    onClick={() => {
                      if (window.confirm('Delete this comment? Replies and audit history are preserved.'))
                        state.remove.mutate({
                          commentId: comment.commentId,
                          rowVersion: comment.rowVersion
                        })
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          )}
        </Stack>
        {editing ? (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField
              size='small'
              multiline
              minRows={2}
              value={body}
              onChange={event => setBody(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 20_000 } }}
            />
            <Stack direction='row' spacing={1}>
              <Button size='small' variant='contained' disabled={!body.trim() || state.isMutating} onClick={() => void save()}>
                Save
              </Button>
              <Button size='small' onClick={() => setEditing(false)}>Cancel</Button>
            </Stack>
          </Stack>
        ) : (
          <Typography
            variant='body2'
            color={deleted ? 'text.secondary' : 'text.primary'}
            sx={{ mt: 1, whiteSpace: 'pre-wrap', fontStyle: deleted ? 'italic' : 'normal' }}
          >
            {deleted ? 'This comment was deleted.' : comment.body}
          </Typography>
        )}
      </Box>
    </Stack>
  )
}

export default function ArticleCommentsPanel({
  state,
  currentDraftId,
  activeThreadId,
  onActiveThreadChange,
  pendingAnchor,
  onClearPendingAnchor,
  locale = 'en',
  anchorPositions = {}
}: ArticleCommentsPanelProps) {
  const [articleComposerOpen, setArticleComposerOpen] = useState(false)
  const [body, setBody] = useState('')
  const [reply, setReply] = useState('')
  const threads = useMemo(() => state.query.data?.threads ?? [], [state.query.data?.threads])
  const orderedThreads = useMemo(() => [...threads].sort((left, right) => {
    const leftPosition = anchorPositions[left.commentId]
    const rightPosition = anchorPositions[right.commentId]
    if (leftPosition == null && rightPosition == null) return 0
    if (leftPosition == null) return 1
    if (rightPosition == null) return -1
    return leftPosition - rightPosition
  }), [anchorPositions, threads])
  const active = threads.find(thread => thread.commentId === activeThreadId) ?? null
  const composerOpen = articleComposerOpen || Boolean(pendingAnchor)
  const error = state.query.error || mutationError(state)
  const errorMessages = useMemo(() => error ? describeApiError(error) : [], [error])

  const closeComposer = () => {
    setArticleComposerOpen(false)
    onClearPendingAnchor()
    setBody('')
  }

  const submit = async () => {
    const value = body.trim()
    if (!value) return
    const created = await state.create.mutateAsync({
      body: value,
      currentDraftId,
      anchorType: pendingAnchor?.anchorType ?? null,
      anchorData: pendingAnchor?.anchorData ?? null
    })
    closeComposer()
    onActiveThreadChange(created.commentId)
  }

  const submitReply = async () => {
    if (!active || !reply.trim()) return
    await state.reply.mutateAsync({ threadId: active.commentId, body: reply.trim() })
    setReply('')
  }

  return (
    <Card
      variant='outlined'
      component='aside'
      aria-label='Article comments'
      sx={{ width: '100%', minWidth: 0, flexShrink: 0, alignSelf: 'flex-start', borderRadius: 2 }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Stack spacing={2.5}>
          <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant='h6'>Comments</Typography>
              <Typography variant='caption' color='text.secondary'>
                {threads.length} thread{threads.length === 1 ? '' : 's'}
              </Typography>
            </Box>
            <Stack direction='row' spacing={1}>
              <Tooltip title='Refresh comments'>
                <IconButton size='small' onClick={() => void state.query.refetch()}>
                  <RefreshCw size={16} />
                </IconButton>
              </Tooltip>
              {state.query.data?.canComment && (
                <Button
                  size='small'
                  variant='outlined'
                  startIcon={<MessageSquarePlus size={15} />}
                  onClick={() => setArticleComposerOpen(true)}
                >
                  Article
                </Button>
              )}
            </Stack>
          </Stack>

          {!state.query.data?.canComment && state.query.isSuccess && (
            <Alert severity='info'>You can read comments, but your role cannot create or modify them.</Alert>
          )}
          {errorMessages.length > 0 && (
            <Alert severity={error instanceof ApiError && error.status === 403 ? 'warning' : 'error'}>
              {error instanceof ApiError && error.status === 409
                ? 'This thread changed in another session. Comments were refreshed; review the latest version and retry.'
                : errorMessages.join(' ')}
            </Alert>
          )}

          {composerOpen && (
            <Card variant='outlined' sx={{ bgcolor: 'warning.lighterOpacity' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack spacing={1.5}>
                  <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant='subtitle2'>
                      {pendingAnchor
                        ? `New ${pendingAnchor.anchorType === 'TextRange' ? 'inline' : 'block'} comment`
                        : 'New article comment'}
                    </Typography>
                    <IconButton size='small' onClick={closeComposer}><X size={15} /></IconButton>
                  </Stack>
                  <TextField
                    autoFocus
                    multiline
                    minRows={3}
                    size='small'
                    label='Comment'
                    value={body}
                    onChange={event => setBody(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 20_000 } }}
                  />
                  <Button
                    variant='contained'
                    size='small'
                    disabled={!body.trim() || state.isMutating}
                    onClick={() => void submit()}
                  >
                    Add comment
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          )}

          {state.query.isLoading && (
            <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant='body2'>Loading comments…</Typography>
            </Stack>
          )}

          {state.query.isSuccess && threads.length === 0 && !composerOpen && (
            <Box sx={{ py: 1, textAlign: 'start' }}>
              <Typography variant='body2' color='text.secondary'>No comments yet.</Typography>
            </Box>
          )}

          {threads.length > 0 && (
            <Box>
              {orderedThreads.map((thread, index) => {
                const position = anchorPositions[thread.commentId]
                const previous = index > 0 ? anchorPositions[orderedThreads[index - 1].commentId] : 0
                const anchorGap = position == null ? 8 : Math.max(8, Math.min(280, position - (previous ?? 0) - (index ? 52 : 0)))
                return (
                <Button
                  key={thread.commentId}
                  variant={thread.commentId === activeThreadId ? 'tonal' : 'text'}
                  color='primary'
                  onClick={() => onActiveThreadChange(thread.commentId)}
                  sx={{
                    display: 'flex', inlineSize: '100%', justifyContent: 'flex-start', textAlign: 'start', py: 1.25,
                    mt: { xs: index ? 1 : 0, lg: `${index ? anchorGap : Math.min(anchorGap, 180)}px` }
                  }}
                >
                  <Box sx={{ minWidth: 0, width: '100%' }}>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant='caption' sx={{ fontWeight: 700 }} noWrap>
                        {thread.createdBy.fullName}
                      </Typography>
                      <Chip
                        size='small'
                        label={anchorLabel(thread)}
                        color='default'
                      />
                    </Stack>
                    <Typography variant='body2' noWrap sx={{ mt: 0.5 }}>
                      {thread.deletedAt ? 'Deleted comment' : thread.body}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {thread.status} · {thread.replies.length} repl{thread.replies.length === 1 ? 'y' : 'ies'}
                    </Typography>
                  </Box>
                </Button>
              )})}
            </Box>
          )}

          {active && (
            <>
              <Divider />
              <Stack spacing={2.5} sx={{ maxHeight: 500, overflowY: 'auto', pr: 0.5 }}>
                <CommentEntry comment={active} state={state} locale={locale} />
                {active.replies.map(item => (
                  <Box key={item.commentId} sx={{ pl: 2, borderInlineStart: theme => `2px solid ${theme.palette.divider}` }}>
                    <CommentEntry comment={item} state={state} locale={locale} />
                  </Box>
                ))}
              </Stack>

              {active.status === 'Open' && state.query.data?.canComment && (
                <Stack spacing={1}>
                  <TextField
                    size='small'
                    multiline
                    minRows={2}
                    label='Reply'
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 20_000 } }}
                  />
                  <Button
                    size='small'
                    variant='outlined'
                    disabled={!reply.trim() || state.isMutating}
                    onClick={() => void submitReply()}
                  >
                    Reply
                  </Button>
                </Stack>
              )}

              {active.canResolve && (
                <Button
                  size='small'
                  variant='contained'
                  color={active.status === 'Resolved' ? 'secondary' : 'success'}
                  disabled={state.isMutating}
                  onClick={() => state.resolution.mutate({
                    threadId: active.commentId,
                    rowVersion: active.rowVersion,
                    resolved: active.status === 'Open'
                  })}
                >
                  {active.status === 'Open' ? 'Resolve thread' : 'Reopen thread'}
                </Button>
              )}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
