'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft } from 'lucide-react'
import type { KnowledgeBaseEditorProps } from '@/features/editor/core/KnowledgeBaseEditor'
import {
  useArticleDraftEditor,
  type ArticleDraftEditorApi
} from '@/features/editor/drafts/useArticleDraftEditor'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbPageShell } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
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
import { createArticle, getArticleById } from '@/lib/api/articlesApi'
import { getArticleDraft, saveArticleDraftContent } from '@/lib/api/articleDraftsApi'
import { describeApiError } from '@/lib/api/http'
import ArticleExportActions from '@/features/articleExport/ArticleExportActions'
import ArticleTranslationsPanel from './ArticleTranslationsPanel'
import type { ArticleDetailsResponse } from '@/types/apps/articleTypes'
import type { ArticleDraftResponse } from '@/types/apps/articleDraftTypes'

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
  sourceArticleId?: string
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
  commentsApi,
  sourceArticleId
}: ArticleEditorShellProps) => {
  const router = useRouter()
  const [pendingMediaUploads, setPendingMediaUploads] = useState(0)
  const [mediaMessages, setMediaMessages] = useState<string[]>([])
  const [activeCommentThreadId, setActiveCommentThreadId] = useState<string | null>(null)
  const [pendingCommentAnchor, setPendingCommentAnchor] = useState<PendingCommentAnchor | null>(null)
  const [commentAnchorPositions, setCommentAnchorPositions] = useState<Record<string, number>>({})
  const [secondaryBusy, setSecondaryBusy] = useState(false)
  const [secondaryMessages, setSecondaryMessages] = useState<string[]>([])
  const [workflowActionsTarget, setWorkflowActionsTarget] = useState<HTMLElement | null>(null)
  const [articleDetails, setArticleDetails] = useState<ArticleDetailsResponse | null>(null)
  const [comparisonSourceId, setComparisonSourceId] = useState<string | null>(sourceArticleId ?? null)
  const [comparisonSource, setComparisonSource] = useState<{ article: ArticleDetailsResponse; draft: ArticleDraftResponse } | null>(null)
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

  useEffect(() => {
    if (!articleId) return
    void getArticleById(articleId, accessToken).then(setArticleDetails).catch(() => setArticleDetails(null))
  }, [accessToken, articleId])

  useEffect(() => {
    if (!comparisonSourceId || comparisonSourceId === articleId) {
      setComparisonSource(null)
      return
    }
    let active = true
    void Promise.all([getArticleById(comparisonSourceId, accessToken), getArticleDraft(comparisonSourceId, accessToken)])
      .then(([article, draft]) => { if (active) setComparisonSource({ article, draft }) })
      .catch(error => { if (active) { setComparisonSource(null); setSecondaryMessages(describeApiError(error)) } })
    return () => { active = false }
  }, [accessToken, articleId, comparisonSourceId])

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

  const showRetry = editor.saveState.status === 'failed'
  const saveButtonDisabled = !editor.editable || editor.saveState.status === 'saving' ||
    editor.saveState.status === 'conflict' || (!editor.saveState.dirty && !showRetry)

  const duplicateArticle = useCallback(async () => {
    if (secondaryBusy) return
    setSecondaryBusy(true)
    setSecondaryMessages([])
    try {
      if (!await editor.prepareForWorkflow()) return
      const [details, sourceDraft] = await Promise.all([
        getArticleById(articleId, accessToken),
        getArticleDraft(articleId, accessToken)
      ])
      if (!details.category) throw new Error('The article must belong to a category before it can be duplicated.')
      const created = await createArticle({
        title: `${details.title} copy`,
        slug: null,
        categoryId: details.category.categoryId,
        visibility: details.visibility ?? 'Public'
      }, accessToken)
      if (!created.currentDraft?.rowVersion) throw new Error('The duplicate article draft could not be initialized.')
      await saveArticleDraftContent(created.articleId, {
        content: sourceDraft.content,
        rowVersion: created.currentDraft.rowVersion
      }, accessToken)
      router.push(getLocalizedUrl(`/editor?articleId=${encodeURIComponent(created.articleId)}`, lang))
    } catch (error) {
      setSecondaryMessages(describeApiError(error))
      editor.reload()
    } finally {
      setSecondaryBusy(false)
    }
  }, [accessToken, articleId, editor, lang, router, secondaryBusy])

  return (
    <Box data-dashboard-full-width>
      <KbPageShell maxWidth='none' spacing={3}>
      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
        <Button variant='text' startIcon={<ArrowLeft size={18} />} onClick={() => void editor.leave(() => router.push(dashboardUrl))}>
          Dashboard
        </Button>
        <Typography variant='h5' sx={{ fontWeight: 750 }}>Edit article</Typography>
        {editor.draft && (
          <Box sx={{ marginInlineStart: 'auto' }}>
            <ArticleExportActions
              articleId={articleId}
              source={{ sourceType: 'Draft', draftId: editor.draft.draftId }}
              accessToken={accessToken}
              beforeExport={editor.prepareForWorkflow}
              disabled={pendingMediaUploads > 0 || editor.saveState.status === 'conflict'}
            />
          </Box>
        )}
      </Stack>

      <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}>
        <CardContent sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box ref={handleWorkflowActionsTarget} sx={{ minBlockSize: 40, display: 'flex', alignItems: 'center' }}>
            {!workflowActionsTarget && <Avatar sx={{ inlineSize: 36, blockSize: 36 }} />}
          </Box>
        </CardContent>
      </Card>

      <KbValidationSummary title='Draft editor' errors={[...editor.messages, ...mediaMessages, ...secondaryMessages]} />

      <ArticleTranslationsPanel
        articleId={articleId}
        accessToken={accessToken}
        article={articleDetails}
        onCompare={setComparisonSourceId}
        onOpenArticle={(targetArticleId, sourceId) => void editor.leave(() => router.push(getLocalizedUrl(
          `/editor?articleId=${encodeURIComponent(targetArticleId)}${sourceId ? `&sourceArticleId=${encodeURIComponent(sourceId)}` : ''}`,
          lang
        )))}
      />

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
        <Stack spacing={3}>
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
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(290px, 23vw)' },
                  alignItems: 'flex-start',
                  gap: { xs: 2, md: 3 },
                  p: { xs: 1.5, sm: 2, md: 2.5 },
                  bgcolor: 'background.default'
                }}
              >
                <Box sx={{ inlineSize: '100%', minInlineSize: 0, display: 'grid', gridTemplateColumns: comparisonSource ? { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' } : '1fr', gap: 2 }}>
                  {comparisonSource && (
                    <Box sx={{ minInlineSize: 0, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                      <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover' }}>
                        <Typography variant='subtitle2'>Source · {comparisonSource.article.title}</Typography>
                        <Typography variant='caption' color='text.secondary'>Read-only — source content cannot be changed here.</Typography>
                      </Box>
                      <EditorCanvas content={comparisonSource.draft.content} editable={false} changeDebounceMs={0} onChange={() => undefined} mediaContentLoader={loadMediaContent} />
                    </Box>
                  )}
                  <Box sx={{ minInlineSize: 0 }}>
                  {comparisonSource && <Box sx={{ px: 1, pb: 1 }}><Typography variant='subtitle2'>Translation · {articleDetails?.title ?? 'Current article'}</Typography></Box>}
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
                    onCommentAnchorPositionsChange={setCommentAnchorPositions}
                    canComment={Boolean(comments.query.data?.canComment)}
                    currentDraftId={editor.draft.draftId}
                    onAddCommentAnchor={(anchorType, anchorData) => {
                      setPendingCommentAnchor({ anchorType, anchorData })
                      setActiveCommentThreadId(null)
                    }}
                  />
                  </Box>
                </Box>
                <ArticleCommentsPanel
                  state={comments}
                  currentDraftId={editor.draft.draftId}
                  activeThreadId={activeCommentThreadId}
                  onActiveThreadChange={setActiveCommentThreadId}
                  pendingAnchor={pendingCommentAnchor}
                  onClearPendingAnchor={() => setPendingCommentAnchor(null)}
                  locale={lang}
                  anchorPositions={commentAnchorPositions}
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
          onChanged={editor.reload}
          actionsTarget={workflowActionsTarget}
          savedAt={editor.lastSavedAt ?? editor.draft?.updatedAt}
          saveLabel={editor.phase === 'loading' ? 'Loading' : saveLabel[editor.saveState.status]}
          onSaveDraft={() => void editor.retrySave()}
          saveDisabled={saveButtonDisabled}
          onVersions={() => void editor.leave(() => router.push(versionHistoryUrl))}
          onDuplicate={() => void duplicateArticle()}
          onDiscard={editor.reload}
          secondaryBusy={secondaryBusy}
          locale={lang}
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
    </Box>
  )
}

export default ArticleEditorShell
