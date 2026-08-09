'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbEmptyState, KbPageHeader, KbPageShell } from '@/views/shared'
import type { ArticleVersionComparisonResponse } from '@/types/apps/articleLifecycleTypes'
import { compareArticleVersions, describeLifecycleError } from '@/lib/api/articleLifecycleApi'
import { snapshotReasonLabel, versionLabel } from './versionUi'

type ArticleVersionComparisonPageProps = {
  lang: string
  articleId: string
  baseVersionId: string
  targetVersionId: string
  accessToken: string
  compare?: typeof compareArticleVersions
  onNavigate?: (url: string) => void
}

const changeColor = {
  Added: 'success',
  Removed: 'error',
  Changed: 'warning'
} as const

export default function ArticleVersionComparisonPage({
  lang,
  articleId,
  baseVersionId,
  targetVersionId,
  accessToken,
  compare = compareArticleVersions,
  onNavigate
}: ArticleVersionComparisonPageProps) {
  const router = useRouter()
  const navigate = onNavigate ?? router.push
  const [comparison, setComparison] = useState<ArticleVersionComparisonResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<string[]>([])
  const historyUrl = getLocalizedUrl(
    `/editor/versions?articleId=${encodeURIComponent(articleId)}`,
    lang
  )

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!articleId || !baseVersionId || !targetVersionId) {
      setMessages(['Select two valid versions before opening comparison.'])
      setLoading(false)
      return
    }
    setLoading(true)
    setMessages([])
    try {
      const result = await compare(
        articleId,
        baseVersionId,
        targetVersionId,
        accessToken,
        signal
      )
      if (!signal?.aborted) setComparison(result)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages(describeLifecycleError(error))
      setComparison(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, articleId, baseVersionId, compare, targetVersionId])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [load])

  return (
    <KbPageShell maxWidth={1200}>
      <KbPageHeader
        eyebrow='Versions'
        title='Compare article versions'
        description={comparison
          ? `${versionLabel(comparison.baseVersion)} (${snapshotReasonLabel[comparison.baseVersion.snapshotReason]}) ` +
            `to ${versionLabel(comparison.targetVersion)} (${snapshotReasonLabel[comparison.targetVersion.snapshotReason]}).`
          : 'Review readable content changes without exposing editor JSON.'}
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
              <Typography>Loading version comparison…</Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {comparison && (
        <>
          <Card variant='outlined'>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Chip color='success' variant='tonal' label={`${comparison.addedCount} added`} />
                <Chip color='error' variant='tonal' label={`${comparison.removedCount} removed`} />
                <Chip color='warning' variant='tonal' label={`${comparison.changedCount} changed`} />
                <Chip variant='outlined' label={`${comparison.unchangedCount} unchanged`} />
              </Stack>
            </CardContent>
          </Card>

          {comparison.changes.length === 0 ? (
            <KbEmptyState
              icon={<CheckCircle2 />}
              title='No readable content changes'
              description='The selected snapshots have the same semantic text blocks.'
            />
          ) : (
            <Stack spacing={3} aria-label='Version comparison changes'>
              {comparison.changes.map((change, index) => (
                <Card
                  key={`${change.changeType}-${change.beforePosition ?? 'new'}-${change.afterPosition ?? 'removed'}-${index}`}
                  variant='outlined'
                  sx={theme => ({
                    borderInlineStart: `4px solid ${theme.palette[changeColor[change.changeType]].main}`
                  })}
                >
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          size='small'
                          color={changeColor[change.changeType]}
                          label={change.changeType}
                        />
                        <Typography variant='subtitle2'>{change.blockLabel}</Typography>
                      </Stack>

                      {change.changeType === 'Changed' ? (
                        <>
                          <Box>
                            <Typography variant='caption' color='text.secondary'>Before</Typography>
                            <Typography
                              component='p'
                              sx={{ mt: 0.5, whiteSpace: 'pre-wrap', bgcolor: 'error.lighterOpacity', p: 2 }}
                            >
                              {change.beforeText}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant='caption' color='text.secondary'>After</Typography>
                            <Typography component='p' sx={{ mt: 0.5, whiteSpace: 'pre-wrap', p: 2 }}>
                              {change.segments.map((segment, segmentIndex) => (
                                <Box
                                  component='span'
                                  key={`${segment.changeType}-${segmentIndex}`}
                                  sx={{
                                    bgcolor: segment.changeType === 'Added'
                                      ? 'success.lighterOpacity'
                                      : segment.changeType === 'Removed'
                                        ? 'error.lighterOpacity'
                                        : undefined,
                                    color: segment.changeType === 'Removed' ? 'error.main' : 'text.primary',
                                    textDecoration: segment.changeType === 'Removed' ? 'line-through' : undefined
                                  }}
                                >
                                  {segment.text}
                                </Box>
                              ))}
                            </Typography>
                          </Box>
                        </>
                      ) : (
                        <Box>
                          <Typography component='p' sx={{ whiteSpace: 'pre-wrap', m: 0 }}>
                            {change.afterText ?? change.beforeText}
                          </Typography>
                        </Box>
                      )}
                      {index < comparison.changes.length - 1 && <Divider sx={{ display: 'none' }} />}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </>
      )}
    </KbPageShell>
  )
}
