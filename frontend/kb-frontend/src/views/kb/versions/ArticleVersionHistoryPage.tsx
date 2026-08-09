'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, Eye, GitCompareArrows, RotateCcw } from 'lucide-react'
import { getLocalizedUrl } from '@/utils/i18n'
import { KbPageHeader, KbPageShell } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import type {
  ArticlePermissionsResponse,
  ArticleVersionListQuery,
  ArticleVersionSummaryResponse
} from '@/types/apps/articleLifecycleTypes'
import type { ArticleDetailsResponse } from '@/types/apps/articleTypes'
import { getArticleById } from '@/lib/api/articlesApi'
import {
  describeLifecycleError,
  getArticlePermissions,
  getArticleVersions,
  restoreArticleVersion
} from '@/lib/api/articleLifecycleApi'
import { formatVersionDate, snapshotReasonLabel, versionLabel } from './versionUi'

export type ArticleVersionHistoryApi = {
  getArticle: typeof getArticleById
  getPermissions: typeof getArticlePermissions
  getVersions: typeof getArticleVersions
  restore: typeof restoreArticleVersion
}

const defaultApi: ArticleVersionHistoryApi = {
  getArticle: getArticleById,
  getPermissions: getArticlePermissions,
  getVersions: getArticleVersions,
  restore: restoreArticleVersion
}

type ArticleVersionHistoryPageProps = {
  lang: string
  articleId: string
  accessToken: string
  api?: ArticleVersionHistoryApi
  onNavigate?: (url: string) => void
}

export default function ArticleVersionHistoryPage({
  lang,
  articleId,
  accessToken,
  api = defaultApi,
  onNavigate
}: ArticleVersionHistoryPageProps) {
  const router = useRouter()
  const navigate = onNavigate ?? router.push
  const [article, setArticle] = useState<ArticleDetailsResponse | null>(null)
  const [permissions, setPermissions] = useState<ArticlePermissionsResponse | null>(null)
  const [versions, setVersions] = useState<ArticleVersionSummaryResponse[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<string[]>([])
  const [restoreVersion, setRestoreVersion] = useState<ArticleVersionSummaryResponse | null>(null)
  const [restoring, setRestoring] = useState(false)
  const editorUrl = getLocalizedUrl(`/editor?articleId=${encodeURIComponent(articleId)}`, lang)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!articleId || !accessToken) {
      setMessages([!articleId ? 'Select an article before opening versions.' : 'Sign in to view versions.'])
      setLoading(false)
      return
    }

    setLoading(true)
    setMessages([])
    try {
      const query: ArticleVersionListQuery = { page: page + 1, pageSize }
      const [nextArticle, nextPermissions, response] = await Promise.all([
        api.getArticle(articleId, accessToken, signal),
        api.getPermissions(articleId, accessToken, signal),
        api.getVersions(articleId, query, accessToken, signal)
      ])
      if (signal?.aborted) return
      if (!nextPermissions.canViewVersionHistory) {
        setMessages(['You do not have permission to view this article’s versions.'])
        setVersions([])
        return
      }
      setArticle(nextArticle)
      setPermissions(nextPermissions)
      setVersions(response.items)
      setTotalCount(response.totalCount)
      setSelectedIds(current => current.filter(id => response.items.some(version => version.versionId === id)))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages(describeLifecycleError(error))
      setVersions([])
      setTotalCount(0)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, api, articleId, page, pageSize])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => void load(controller.signal), 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [load])

  const selectVersions = (ids: string[]) => {
    if (ids.length <= 2) {
      setSelectedIds(ids)
      return
    }
    setSelectedIds(ids.slice(-2))
  }

  const compareSelected = () => {
    if (selectedIds.length !== 2) return
    const selected = selectedIds
      .map(id => versions.find(version => version.versionId === id))
      .filter((version): version is ArticleVersionSummaryResponse => Boolean(version))
      .sort((left, right) => left.versionNumber - right.versionNumber)
    if (selected.length !== 2) return
    navigate(getLocalizedUrl(
      `/editor/versions/compare?articleId=${encodeURIComponent(articleId)}` +
      `&baseVersionId=${encodeURIComponent(selected[0].versionId)}` +
      `&targetVersionId=${encodeURIComponent(selected[1].versionId)}`,
      lang
    ))
  }

  const confirmRestore = async () => {
    if (!restoreVersion || restoring) return
    setRestoring(true)
    setMessages([])
    try {
      const current = await api.getArticle(articleId, accessToken)
      const rowVersion = current.currentDraft?.rowVersion
      if (!rowVersion) throw new Error('The article does not have a current draft row version.')
      const restored = await api.restore(
        articleId,
        restoreVersion.versionId,
        { rowVersion },
        accessToken
      )
      navigate(getLocalizedUrl(
        `/editor?articleId=${encodeURIComponent(articleId)}` +
        `&restoredFromVersion=${restoreVersion.versionNumber}` +
        `&draftId=${encodeURIComponent(restored.draftId)}`,
        lang
      ))
    } catch (error) {
      setMessages(describeLifecycleError(error))
    } finally {
      setRestoring(false)
    }
  }

  const columns = useMemo<KbDataTableColumn<ArticleVersionSummaryResponse>[]>(() => [
    {
      id: 'version',
      label: 'Version',
      render: version => (
        <Stack spacing={0.5}>
          <Typography variant='body2' sx={{ fontWeight: 700 }}>{versionLabel(version)}</Typography>
          {version.sourceDraftNumber && (
            <Typography variant='caption' color='text.secondary'>Draft {version.sourceDraftNumber}</Typography>
          )}
        </Stack>
      )
    },
    {
      id: 'reason',
      label: 'Snapshot reason',
      render: version => snapshotReasonLabel[version.snapshotReason]
    },
    {
      id: 'author',
      label: 'Author',
      render: version => version.createdBy.fullName
    },
    {
      id: 'created',
      label: 'Created',
      render: version => formatVersionDate(version.createdAt, lang)
    },
    {
      id: 'status',
      label: 'Publishing status',
      render: version => (
        <Chip
          size='small'
          variant='tonal'
          color={version.isPublished ? 'success' : 'default'}
          label={version.isPublished ? 'Published snapshot' : 'Workflow snapshot'}
        />
      )
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      render: version => (
        <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button
            size='small'
            startIcon={<Eye size={15} />}
            onClick={() => navigate(getLocalizedUrl(
              `/editor/versions/${encodeURIComponent(version.versionId)}?articleId=${encodeURIComponent(articleId)}`,
              lang
            ))}
          >
            Details
          </Button>
          {permissions?.canRestoreVersion && (
            <Button
              size='small'
              startIcon={<RotateCcw size={15} />}
              disabled={restoring}
              onClick={() => setRestoreVersion(version)}
            >
              Restore
            </Button>
          )}
        </Stack>
      )
    }
  ], [articleId, lang, navigate, permissions?.canRestoreVersion, restoring])

  return (
    <KbPageShell>
      <KbPageHeader
        eyebrow='Articles'
        title='Versions'
        description={article
          ? `Immutable snapshots for “${article.title}”. Select two versions to compare their readable content.`
          : 'Browse immutable article snapshots and compare readable content.'}
        actions={
          <>
            <Button variant='outlined' startIcon={<ArrowLeft />} onClick={() => navigate(editorUrl)}>
              Back to editor
            </Button>
            <Button
              variant='contained'
              startIcon={<GitCompareArrows />}
              disabled={selectedIds.length !== 2}
              onClick={compareSelected}
            >
              Compare selected ({selectedIds.length}/2)
            </Button>
          </>
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

      <KbDataTable
        ariaLabel='Article versions'
        rows={versions}
        columns={columns}
        getRowId={version => version.versionId}
        loading={loading}
        enableSelection
        selectedRowIds={selectedIds}
        onSelectedRowIdsChange={selectVersions}
        emptyState={{
          title: 'No version snapshots yet',
          description: 'Review snapshots appear when the article is submitted. Publishing creates the immutable published version.'
        }}
        pagination={{
          page,
          rowsPerPage: pageSize,
          totalRows: totalCount,
          onPageChange: setPage,
          onRowsPerPageChange: next => {
            setPage(0)
            setPageSize(next)
          }
        }}
      />

      {selectedIds.length === 1 && (
        <Box>
          <Typography variant='body2' color='text.secondary'>
            Select one more version to enable comparison.
          </Typography>
        </Box>
      )}

      <KbConfirmDialog
        open={Boolean(restoreVersion)}
        title={`Restore ${restoreVersion ? versionLabel(restoreVersion).toLowerCase() : 'version'}?`}
        description='This does not replace the published article. A new current editable draft will be created, replacing any existing editable draft pointer, and must pass through the normal review and publishing workflow.'
        confirmLabel='Create restored draft'
        submitting={restoring}
        onClose={() => {
          if (!restoring) setRestoreVersion(null)
        }}
        onConfirm={() => void confirmRestore()}
      />
    </KbPageShell>
  )
}
