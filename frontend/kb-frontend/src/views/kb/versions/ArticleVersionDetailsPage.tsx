'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft } from 'lucide-react'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbPageHeader, KbPageShell } from '@/views/shared'
import type { ArticleVersionDetailsResponse } from '@/types/apps/articleLifecycleTypes'
import {
  describeLifecycleError,
  getArticleVersion
} from '@/lib/api/articleLifecycleApi'
import { formatVersionDate, snapshotReasonLabel, versionLabel } from './versionUi'

type ArticleVersionDetailsPageProps = {
  lang: string
  articleId: string
  versionId: string
  accessToken: string
  getVersion?: typeof getArticleVersion
  onNavigate?: (url: string) => void
}

export default function ArticleVersionDetailsPage({
  lang,
  articleId,
  versionId,
  accessToken,
  getVersion = getArticleVersion,
  onNavigate
}: ArticleVersionDetailsPageProps) {
  const router = useRouter()
  const navigate = onNavigate ?? router.push
  const [version, setVersion] = useState<ArticleVersionDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<string[]>([])
  const historyUrl = getLocalizedUrl(
    `/editor/versions?articleId=${encodeURIComponent(articleId)}`,
    lang
  )

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setMessages([])
    try {
      const result = await getVersion(articleId, versionId, accessToken, signal)
      if (!signal?.aborted) setVersion(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages(describeLifecycleError(error))
      setVersion(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, articleId, getVersion, versionId])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [load])

  return (
    <KbPageShell maxWidth={1000}>
      <KbPageHeader
        eyebrow='Version history'
        title={version ? versionLabel(version) : 'Version details'}
        description='Readable snapshot content and provenance. Editor JSON and storage paths are not displayed.'
        actions={
          <Button variant='outlined' startIcon={<ArrowLeft />} onClick={() => navigate(historyUrl)}>
            Back to history
          </Button>
        }
      />

      {messages.length > 0 && (
        <Alert
          severity='error'
          action={<Button color='inherit' size='small' onClick={() => void load()}>Retry</Button>}
        >
          {messages.join(' ')}
        </Alert>
      )}

      {loading && (
        <Card variant='outlined'>
          <CardContent>
            <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
              <CircularProgress size={22} />
              <Typography>Loading version details…</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {version && (
        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={3}>
              <Stack direction='row' spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip variant='tonal' label={snapshotReasonLabel[version.snapshotReason]} />
                <Chip
                  variant='tonal'
                  color={version.isPublished ? 'success' : 'default'}
                  label={version.isPublished ? 'Published snapshot' : 'Workflow snapshot'}
                />
                {version.sourceDraftNumber && <Chip variant='outlined' label={`Draft ${version.sourceDraftNumber}`} />}
              </Stack>
              <Typography variant='body2' color='text.secondary'>
                Created by {version.createdBy.fullName} on {formatVersionDate(version.createdAt, lang)}
              </Typography>
              <Divider />
              <Typography variant='subtitle1' sx={{ fontWeight: 700 }}>Snapshot content</Typography>
              <Typography
                component='div'
                sx={{
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.75,
                  fontFamily: 'inherit',
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  p: 3
                }}
              >
                {version.plainText || 'This snapshot has no readable text content.'}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}
    </KbPageShell>
  )
}
