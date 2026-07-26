'use client'

import { useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
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
import { RefreshCw, Save } from 'lucide-react'
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

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(() => import('@/features/editor/core/KnowledgeBaseEditor'), {
  ssr: false
})

type ArticleEditorShellProps = {
  lang: string
  articleId: string
  /** Supplied by the company SSO/session integration, following the existing API-client convention. */
  accessToken: string
  api?: ArticleDraftEditorApi
}

const saveLabel = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving',
  failed: 'Save failed',
  conflict: 'Conflict detected'
} as const

const ArticleEditorShell = ({ lang, articleId, accessToken, api }: ArticleEditorShellProps) => {
  const router = useRouter()
  const editor = useArticleDraftEditor({ articleId, accessToken, api })
  const articlesUrl = getLocalizedUrl('/articles', lang)

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
    <KbPageShell maxWidth='100%'>
      <PageHeader
        title='Article Editor'
        subtitle={articleId ? `Draft content for article ${articleId}` : 'No article selected'}
        actions={
          <>
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
            <Button variant='contained' onClick={() => void editor.leave(() => router.push(articlesUrl))}>
              Back to Articles
            </Button>
          </>
        }
      />

      <KbValidationSummary title='Draft editor' errors={editor.messages} />

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
              <Box sx={{ p: 3, borderBlockEnd: theme => `1px solid ${theme.palette.divider}` }}>
                <Link href={articlesUrl}>Articles</Link>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 3, md: 5 }, bgcolor: 'background.default' }}>
                <Box sx={{ inlineSize: '100%', maxInlineSize: 1120 }}>
                  <EditorCanvas
                    key={editor.editorKey}
                    content={editor.draft.content}
                    editable={editor.editable}
                    changeDebounceMs={0}
                    onChange={editor.onEditorChange}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      )}
    </KbPageShell>
  )
}

export default ArticleEditorShell
