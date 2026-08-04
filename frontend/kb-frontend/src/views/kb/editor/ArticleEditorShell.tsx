'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, History, RefreshCw, Save } from 'lucide-react'
import type { KnowledgeBaseEditorProps } from '@/features/editor/core/KnowledgeBaseEditor'
import {
  useArticleDraftEditor,
  type ArticleDraftEditorApi
} from '@/features/editor/drafts/useArticleDraftEditor'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbPageShell } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'
import {
  mediaLibraryApi,
  type MediaLibraryApi
} from '@/lib/api/mediaApi'
import { createEditorMediaUploadController } from '@/features/editor/media/MediaUploadController'
import ArticleLifecyclePanel from '@/features/lifecycle/ArticleLifecyclePanel'
import ArticleCommentsPanel, {
  type PendingCommentAnchor
} from '@/features/comments/ArticleCommentsPanel'
import { useArticleComments } from '@/features/comments/useArticleComments'
import type { ArticleCommentsApi } from '@/lib/api/articleCommentsApi'

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(() => import('@/features/editor/core/KnowledgeBaseEditor'), {
  ssr: false
})

type ArticleEditorShellProps = {
  lang: string
  articleId: string
  /** Supplied by the company SSO/session integration, following the existing API-client convention. */
  accessToken: string
  restoredFromVersion?: string
  api?: ArticleDraftEditorApi
  mediaApi?: MediaLibraryApi
  commentsApi?: ArticleCommentsApi
}

const saveLabel = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving',
  failed: 'Save failed',
  conflict: 'Conflict detected'
} as const

const ArticleEditorShell = ({
  lang,
  articleId,
  accessToken,
  restoredFromVersion,
  api,
  mediaApi = mediaLibraryApi,
  commentsApi
}: ArticleEditorShellProps) => {
  const router = useRouter()
  const [pendingMediaUploads, setPendingMediaUploads] = useState(0)
  const [mediaMessages, setMediaMessages] = useState<string[]>([])
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<string | null>(null)
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<PendingCommentAnchor | null>(null)
  const [workflowActionsTarget, setWorkflowActionsTarget] = useState<HTMLElement | null>(null)
  const handleWorkflowActionsTarget = useCallback((node: HTMLElement | null) => {
    setWorkflowActionsTarget(node)
  }, [])
  const commentsRefreshVersion = useRef('')
  const handleMediaError = useCallback((message: string) => {
    setMediaMessages(current => [...current.filter(item => item !== message), message])
  }, [])
  const clearMediaError = useCallback((fileName: string) => {
    setMediaMessages(current => current.filter(message => !message.startsWith(`${fileName}:`)))
  }, [])
  const mediaController = useMemo(() => createEditorMediaUploadController({
    upload: file => mediaApi.upload(file, accessToken),
    onError: handleMediaError,
    onResolved: clearMediaError
  }), [accessToken, clearMediaError, handleMediaError, mediaApi])
  const loadMediaContent = useCallback(
    (mediaId: string) => mediaApi.getContent(mediaId, accessToken),
    [accessToken, mediaApi]
  )
  const handleFileUploadError = useCallback((error: unknown) => {
    handleMediaError(
      error instanceof Error ? error.message : 'The media upload failed.'
    )
  }, [handleMediaError])
  const editor = useArticleDraftEditor({
    articleId,
    accessToken,
    api,
    pendingMediaUploads
  })
  const comments = useArticleComments(articleId, accessToken, commentsApi)
  const dashboardUrl = getLocalizedUrl('/dashboard', lang)
  const versionHistoryUrl = getLocalizedUrl(
    `/editor/versions?articleId=${encodeURIComponent(articleId)}`,
    lang
  )

  useEffect(
    () => mediaController.subscribe(setPendingMediaUploads),
    [mediaController]
  )

  useEffect(() => {
    const version = editor.saveState.rowVersion
    if (!version || editor.saveState.status !== 'saved' || commentsRefreshVersion.current === version) return
    commentsRefreshVersion.current = version
    void comments.query.refetch()
  }, [comments.query, editor.saveState.rowVersion, editor.saveState.status])

  const pageState = useMemo(() => {
    if (editor.phase === 'loading') return 'Loading'
    if (editor.phase === 'acquiring') return 'Acquiring lock'
    if (editor.phase === 'locked') return 'Locked by another user'
    if (editor.phase === 'readonly') return 'Read-only'
    if (editor.phase === 'error') return 'Read-only'
    return saveLabel[editor.saveState.status]
  }, [editor.phase, editor.saveState.status])

  useEffect(() => {
    if (!editor.draft?.isLockOwner) return

    const interceptNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      const anchor = target instanceof Element ? target.closest('a[href]') : null

      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return

      event.preventDefault()
      void editor.leave(() => router.push(`${destination.pathname}${destination.search}${destination.hash}`))
    }

    document.addEventListener('click', interceptNavigation, true)
    return () => document.removeEventListener('click', interceptNavigation, true)
  }, [editor, router])

  const lockOwner = editor.draft?.lock.lockedBy
  const lockedAt = editor.draft?.lock.lockedAt
  const lockTime = lockedAt
    ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lockedAt))
    : null
  const showRetry = editor.saveState.status === 'failed'
  const showReload = editor.phase === 'error' || editor.saveState.status === 'conflict'
  const saveButtonDisabled = !editor.editable || editor.saveState.status === 'saving' ||
    editor.saveState.status === 'conflict' || (!editor.saveState.dirty && !showRetry)

  return (
    <KbPageShell maxWidth={1720} spacing={4}>
      <PageHeader
        title='Edit article'
        subtitle={articleId
          ? 'Write, collaborate, and move this article through its publishing workflow.'
          : 'Open an article from the dashboard to begin editing.'}
        actions={
          <>
            <Button
              variant='text'
              startIcon={<ArrowLeft size={18} />}
              onClick={() => void editor.leave(() => router.push(dashboardUrl))}
            >
              Dashboard
            </Button>
            <StatusChip label={pageState} color={editor.saveState.status === 'conflict' || editor.saveState.status === 'failed' ? 'error' : undefined} />
            <Button
              variant='outlined'
              startIcon={<Save size={18} />}
              disabled={saveButtonDisabled}
              onClick={() => void editor.retrySave()}
            >
              {showRetry ? 'Retry save' : 'Save now'}
            </Button>
            {showReload && (
              <Button variant='outlined' startIcon={<RefreshCw size={18} />} onClick={editor.reload}>
                Reload server draft
              </Button>
            )}
            {articleId && (
              <Button
                variant='outlined'
                startIcon={<History size={18} />}
                onClick={() => void editor.leave(() => router.push(versionHistoryUrl))}
              >
                Version history
              </Button>
            )}
            <Box
              component='span'
              ref={handleWorkflowActionsTarget}
              sx={{ display: 'contents' }}
            />
          </>
        }
      />

      <KbValidationSummary title='Draft editor' errors={[...editor.messages, ...mediaMessages]} />

      {restoredFromVersion && (
        <Alert severity='success'>
          A new editable draft was created from version {restoredFromVersion}. The currently published article is
          unchanged until this draft completes review and is published.
        </Alert>
      )}

      {pendingMediaUploads > 0 && (
        <Alert severity='info'>
          {pendingMediaUploads} media upload{pendingMediaUploads === 1 ? ' is' : 's are'} still in progress. Saving will include each item after its upload completes.
        </Alert>
      )}

      {editor.phase === 'loading' && (
        <Card variant='outlined'>
          <CardContent>
            <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
              <CircularProgress size={22} />
              <Typography>Loading the current draft…</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {editor.draft && (
        <Stack spacing={4}>
          <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}>
            <CardContent sx={{ p: 4, '&:last-child': { pb: 4 } }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={3}
                sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
              >
                <Stack spacing={1}>
                  <Stack direction='row' spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    <StatusChip label={editor.draft.status} />
                    <Chip size='small' variant='tonal' label={pageState} />
                  </Stack>
                  {editor.phase === 'acquiring' && (
                    <Typography variant='body2' color='text.secondary'>Acquiring the edit lock. The editor is disabled until this succeeds.</Typography>
                  )}
                  {lockOwner && (
                    <Typography variant='body2' color='text.secondary'>
                      Locked by {lockOwner.fullName}{lockTime ? ` at ${lockTime}` : ''}
                    </Typography>
                  )}
                </Stack>
                <Typography variant='body2' color={editor.saveState.dirty ? 'warning.main' : 'text.secondary'}>
                  {saveLabel[editor.saveState.status]}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {editor.phase === 'locked' && (
            <Alert severity='warning'>
              {lockOwner ? `${lockOwner.fullName} owns this lock${lockTime ? ` since ${lockTime}` : ''}.` : 'Another user owns this lock.'} The content is read-only.
            </Alert>
          )}
          {editor.phase === 'readonly' && <Alert severity='info'>This draft is open read-only.</Alert>}
          {editor.saveState.status === 'failed' && (
            <Alert severity='error'>The save failed. Your unsaved content is still in this editor. Retry when the service is available.</Alert>
          )}
          {editor.saveState.status === 'conflict' && (
            <Alert severity='error'>
              Conflict detected. Autosave has stopped and no overwrite or merge was attempted. Reload the server draft when you are ready to discard local changes.
            </Alert>
          )}

          <Card variant='outlined' sx={{ overflow: 'hidden', borderRadius: 2, boxShadow: 'none' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 1120px) 340px' },
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: { xs: 3, md: 4 },
                  p: { xs: 2, sm: 3, md: 4 },
                  bgcolor: 'background.default'
                }}
              >
                <Box sx={{ inlineSize: '100%', maxInlineSize: 1120, minInlineSize: 0 }}>
                  <EditorCanvas
                    key={editor.editorKey}
                    content={editor.draft.content}
                    editable={editor.editable}
                    changeDebounceMs={0}
                    onChange={editor.onEditorChange}
                    fileUploadAdapter={mediaController.adapter}
                    fileUploadErrorHandler={handleFileUploadError}
                    mediaUploadController={mediaController}
                    mediaLibraryApi={mediaApi}
                    mediaAccessToken={accessToken}
                    mediaContentLoader={loadMediaContent}
                    commentAnchors={comments.query.data?.threads ?? []}
                    activeCommentThreadId={activeCommentThreadId}
                    onSelectCommentThread={setActiveCommentThreadId}
                    canComment={Boolean(comments.query.data?.canComment)}
                    currentDraftId={editor.draft.draftId}
                    onAddCommentAnchor={(anchorType, anchorData) => {
                      setPendingCommentAnchor({ anchorType, anchorData })
                      setActiveCommentThreadId(null)
                    }}
                  />
                </Box>
                <ArticleCommentsPanel
                  state={comments}
                  currentDraftId={editor.draft.draftId}
                  activeThreadId={activeCommentThreadId}
                  onActiveThreadChange={setActiveCommentThreadId}
                  pendingAnchor={pendingCommentAnchor}
                  onClearPendingAnchor={() => setPendingCommentAnchor(null)}
                  locale={lang}
                />
              </Box>
            </CardContent>
          </Card>
        </Stack>
      )}

      {articleId && (
        <ArticleLifecyclePanel
          articleId={articleId}
          accessToken={accessToken}
          beforeAction={editor.prepareForWorkflow}
          actionsTarget={workflowActionsTarget}
          actionsInHeader
          actionsDisabled={Boolean(
            editor.draft?.lock.isLocked && !editor.draft.isLockOwner ||
            editor.saveState.status === 'conflict' ||
            pendingMediaUploads > 0
          )}
          actionsDisabledReason={
            editor.draft?.lock.isLocked && !editor.draft.isLockOwner
              ? 'Lifecycle actions are disabled while another user owns the draft lock.'
              : editor.saveState.status === 'conflict'
                ? 'Reload the conflicting draft before changing lifecycle state.'
                : pendingMediaUploads > 0
                  ? 'Wait for media uploads to finish before changing lifecycle state.'
                  : undefined
          }
        />
      )}
    </KbPageShell>
  )
}

export default ArticleEditorShell
