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
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbEmptyState, KbPageHeader, KbPageShell } from '@/views/shared'
import type {
  ArticleVersionComparisonResponse,
  ArticleVersionSummaryResponse
} from '@/types/apps/articleLifecycleTypes'
import {
  compareArticleVersions,
  describeLifecycleError,
  getArticleVersions
} from '@/lib/api/articleLifecycleApi'
import { formatVersionDate, snapshotReasonLabel, versionLabel } from './versionUi'

type ArticleVersionComparisonPageProps = {
  lang: string
  articleId: string
  baseVersionId: string
  targetVersionId: string
  accessToken: string
  compare?: typeof compareArticleVersions
  getVersions?: typeof getArticleVersions
  onNavigate?: (url: string) => void
}

const changeColor = {
  Added: 'success',
  Removed: 'error',
  Changed: 'warning',
  Unchanged: 'default'
} as const

export default function ArticleVersionComparisonPage({
  lang,
  articleId,
  baseVersionId,
  targetVersionId,
  accessToken,
  compare = compareArticleVersions,
  getVersions = getArticleVersions,
  onNavigate
}: ArticleVersionComparisonPageProps) {
  const router = useRouter()
  const navigate = onNavigate ?? router.push
  const [comparison, setComparison] = useState<ArticleVersionComparisonResponse | null>(null)
  const [versions, setVersions] = useState<ArticleVersionSummaryResponse[]>([])
  const [olderVersionId, setOlderVersionId] = useState(baseVersionId)
  const [newerVersionId, setNewerVersionId] = useState(targetVersionId)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<string[]>([])
  const historyUrl = getLocalizedUrl(
    `/editor/versions?articleId=${encodeURIComponent(articleId)}`,
    lang
  )

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!articleId || !olderVersionId || !newerVersionId) {
      setMessages(['Select two valid versions before opening comparison.'])
      setLoading(false)
      return
    }
    setLoading(true)
    setMessages([])
    try {
      const result = await compare(
        articleId,
        olderVersionId,
        newerVersionId,
        accessToken,
        signal
      )
      if (!signal?.aborted) {
        setComparison(result)
        setOlderVersionId(result.baseVersion.versionId)
        setNewerVersionId(result.targetVersion.versionId)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages(describeLifecycleError(error))
      setComparison(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, articleId, compare, newerVersionId, olderVersionId])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [load])

  useEffect(() => {
    const controller = new AbortController()
    const loadAll = async () => {
      try {
        const loaded: ArticleVersionSummaryResponse[] = []
        let page = 1
        let totalCount = 0
        do {
          const response = await getVersions(articleId, { page, pageSize: 100 }, accessToken, controller.signal)
          loaded.push(...response.items)
          totalCount = response.totalCount
          page += 1
        } while (loaded.length < totalCount && !controller.signal.aborted)
        if (!controller.signal.aborted)
          setVersions(loaded.sort((left, right) => left.versionNumber - right.versionNumber))
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMessages(current => [...current, ...describeLifecycleError(error)])
      }
    }
    if (articleId && accessToken) void loadAll()
    return () => controller.abort()
  }, [accessToken, articleId, getVersions])

  const selectVersion = (side: 'older' | 'newer', versionId: string) => {
    const otherId = side === 'older' ? newerVersionId : olderVersionId
    if (!versionId || versionId === otherId) return
    const selected = versions.find(version => version.versionId === versionId)
    const other = versions.find(version => version.versionId === otherId)
    if (!selected || !other) return
    const [older, newer] = [selected, other].sort((left, right) => left.versionNumber - right.versionNumber)
    setOlderVersionId(older.versionId)
    setNewerVersionId(newer.versionId)
  }

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

      {versions.length > 1 && (
        <Card variant='outlined'>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel id='older-version-label'>Older version</InputLabel>
                <Select
                  labelId='older-version-label'
                  label='Older version'
                  value={olderVersionId}
                  onChange={event => selectVersion('older', event.target.value)}
                >
                  {versions.map(version => (
                    <MenuItem key={version.versionId} value={version.versionId} disabled={version.versionId === newerVersionId}>
                      {versionLabel(version)} · {snapshotReasonLabel[version.snapshotReason]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id='newer-version-label'>Newer version</InputLabel>
                <Select
                  labelId='newer-version-label'
                  label='Newer version'
                  value={newerVersionId}
                  onChange={event => selectVersion('newer', event.target.value)}
                >
                  {versions.map(version => (
                    <MenuItem key={version.versionId} value={version.versionId} disabled={version.versionId === olderVersionId}>
                      {versionLabel(version)} · {snapshotReasonLabel[version.snapshotReason]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            {([
              ['Older version', comparison.baseVersion],
              ['Newer version', comparison.targetVersion]
            ] as const).map(([title, version]) => (
              <Card key={title} variant='outlined'>
                <CardContent>
                  <Stack spacing={0.75}>
                    <Typography variant='overline' color='text.secondary'>{title}</Typography>
                    <Typography variant='h6'>{versionLabel(version)}</Typography>
                    <Typography variant='body2'>Author: {version.createdBy.fullName}</Typography>
                    <Typography variant='body2'>Created: {formatVersionDate(version.createdAt, lang)}</Typography>
                    {version.publishedAt && (
                      <Typography variant='body2'>
                        Published: {formatVersionDate(version.publishedAt, lang)}
                        {version.publishedBy ? ` by ${version.publishedBy.fullName}` : ''}
                      </Typography>
                    )}
                    <Typography variant='caption' color='text.secondary'>
                      {snapshotReasonLabel[version.snapshotReason]}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>

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
                    borderInlineStart: change.changeType === 'Unchanged'
                      ? `4px solid ${theme.palette.divider}`
                      : `4px solid ${theme.palette[changeColor[change.changeType]].main}`,
                    bgcolor: change.changeType === 'Added'
                      ? 'success.lighterOpacity'
                      : change.changeType === 'Removed'
                        ? 'error.lighterOpacity'
                        : change.changeType === 'Changed'
                          ? 'warning.lighterOpacity'
                          : 'background.paper'
                  })}
                >
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          size='small'
                          color={changeColor[change.changeType]}
                          variant={change.changeType === 'Unchanged' ? 'outlined' : 'tonal'}
                          label={change.changeType === 'Changed' ? 'Modified' : change.changeType}
                        />
                        <Typography variant='subtitle2'>{change.blockLabel}</Typography>
                      </Stack>

                      {change.changeType === 'Changed' ? (
                        <>
                          <Box>
                            <Typography variant='caption' color='text.secondary'>Older version</Typography>
                            <Typography component='p' sx={{ mt: 0.5, whiteSpace: 'pre-wrap', p: 2 }}>
                              {change.segments.filter(segment => segment.changeType !== 'Added')
                                .map((segment, segmentIndex) => (
                                  <Box
                                    component='span'
                                    key={`${segment.changeType}-${segmentIndex}`}
                                    sx={{
                                      bgcolor: segment.changeType === 'Removed' ? 'error.lighterOpacity' : undefined,
                                      color: segment.changeType === 'Removed' ? 'error.main' : 'text.primary',
                                      textDecoration: segment.changeType === 'Removed' ? 'line-through' : undefined
                                    }}
                                  >
                                    {segment.text}
                                  </Box>
                                ))}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant='caption' color='text.secondary'>Newer version</Typography>
                            <Typography component='p' sx={{ mt: 0.5, whiteSpace: 'pre-wrap', p: 2 }}>
                              {change.segments.filter(segment => segment.changeType !== 'Removed')
                                .map((segment, segmentIndex) => (
                                <Box
                                  component='span'
                                  key={`${segment.changeType}-${segmentIndex}`}
                                  sx={{
                                    bgcolor: segment.changeType === 'Unchanged'
                                      ? undefined
                                      : 'success.lighterOpacity',
                                    color: segment.changeType === 'Unchanged' ? 'text.primary' : 'success.dark'
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
                          <Typography
                            component='p'
                            sx={{
                              whiteSpace: 'pre-wrap',
                              m: 0,
                              color: change.changeType === 'Removed' ? 'error.main' : 'text.primary',
                              textDecoration: change.changeType === 'Removed' ? 'line-through' : undefined
                            }}
                          >
                            {change.afterText ?? change.beforeText}
                          </Typography>
                        </Box>
                      )}
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
