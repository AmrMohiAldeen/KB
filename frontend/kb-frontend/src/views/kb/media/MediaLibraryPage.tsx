'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  Archive,
  Download,
  ExternalLink,
  ImageUp,
  RotateCcw,
  Trash2,
  Upload
} from 'lucide-react'
import type {
  MediaKind,
  MediaListItemResponse,
  MediaStatus
} from '@/types/apps/mediaTypes'
import type { KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { hasAccessToken, isAuthenticationError } from '@/lib/api/http'
import { useAccessToken } from '@/lib/auth/accessTokenContext'
import { describeMediaApiError, mediaLibraryApi } from '@/lib/api/mediaApi'
import { KbPageShell } from '@/views/shared'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbTableFilter from '@/views/shared/tables/KbTableFilter'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'
import MediaPreview from './MediaPreview'
import MediaReferencesDialog from './MediaReferencesDialog'
import MediaReplaceDialog from './MediaReplaceDialog'
import MediaUploadDialog from './MediaUploadDialog'
import {
  MEDIA_KIND_OPTIONS,
  formatFileSize,
  mediaKindFromMimeType
} from './utils/mediaValidation'

type MediaLibraryPageProps = {
  accessToken?: string
  locale?: string
  api?: MediaLibraryApi
}

type ConfirmAction = {
  kind: 'archive' | 'delete'
  file: MediaListItemResponse
}

const statusOptions: Array<{ value: MediaStatus; label: string }> = [
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' },
  { value: 'Temporary', label: 'Temporary' },
  { value: 'Deleted', label: 'Deleted' }
]

const statusColor: Record<MediaStatus, 'default' | 'info' | 'success' | 'warning'> = {
  Active: 'success',
  Archived: 'warning',
  Temporary: 'info',
  Deleted: 'default'
}

const mediaKindLabel: Record<MediaKind, string> = {
  image: 'Image',
  gif: 'GIF',
  video: 'Video',
  pdf: 'PDF',
  document: 'Document'
}

const missingTokenMessage = 'Sign in through the company authentication provider before loading media.'

const MediaLibraryPage = ({
  accessToken: accessTokenOverride,
  locale = 'en',
  api = mediaLibraryApi
}: MediaLibraryPageProps) => {
  const contextAccessToken = useAccessToken()
  const accessToken = accessTokenOverride ?? contextAccessToken
  const authenticated = hasAccessToken(accessToken)
  const [files, setFiles] = useState<MediaListItemResponse[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [mediaType, setMediaType] = useState<MediaKind | ''>('')
  const [status, setStatus] = useState<MediaStatus | ''>('Active')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(authenticated)
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [unauthorized, setUnauthorized] = useState(!authenticated)
  const [authenticationMessage, setAuthenticationMessage] = useState(
    authenticated ? '' : missingTokenMessage
  )
  const [actionErrors, setActionErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>()
  const [referencesFile, setReferencesFile] = useState<MediaListItemResponse>()
  const [replaceFile, setReplaceFile] = useState<MediaListItemResponse>()
  const [mutating, setMutating] = useState(false)
  const [downloadingId, setDownloadingId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [search])

  const loadMedia = useCallback(async (signal?: AbortSignal) => {
    if (!authenticated) {
      setFiles([])
      setTotalCount(0)
      setLoading(false)
      setUnauthorized(true)
      setAuthenticationMessage(missingTokenMessage)
      setLoadErrors([])
      return
    }

    setLoading(true)
    setUnauthorized(false)
    setAuthenticationMessage('')
    setLoadErrors([])

    try {
      const response = await api.getList({
        search: debouncedSearch || undefined,
        mediaType: mediaType || undefined,
        status: status || undefined,
        page: page + 1,
        pageSize
      }, accessToken, signal)

      setFiles(response.items)
      setTotalCount(response.totalCount)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return

      setFiles([])
      setTotalCount(0)
      if (isAuthenticationError(error)) {
        setUnauthorized(true)
        setAuthenticationMessage(describeMediaApiError(error)[0] ?? missingTokenMessage)
        setLoadErrors([])
      } else {
        setUnauthorized(false)
        setAuthenticationMessage('')
        setLoadErrors(describeMediaApiError(error))
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, api, authenticated, debouncedSearch, mediaType, page, pageSize, status])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadMedia(controller.signal), 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadMedia, refreshKey])

  const refresh = () => setRefreshKey(value => value + 1)

  const formatUploadedAt = useCallback((value: string) => {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  }, [locale])

  const handleDownload = useCallback(async (file: MediaListItemResponse) => {
    if (!accessToken || downloadingId) return

    setDownloadingId(file.mediaId)
    setActionErrors([])

    try {
      const blob = await api.download(file.mediaId, accessToken)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = objectUrl
      link.download = file.originalFileName
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      setActionErrors(describeMediaApiError(error))
    } finally {
      setDownloadingId('')
    }
  }, [accessToken, api, downloadingId])

  const handleOpen = useCallback(async (file: MediaListItemResponse) => {
    if (!accessToken || downloadingId) return

    const opened = window.open('about:blank', '_blank')

    if (opened) opened.opener = null
    setDownloadingId(file.mediaId)
    setActionErrors([])

    try {
      const blob = await api.getContent(file.mediaId, accessToken)
      const objectUrl = URL.createObjectURL(blob)

      if (opened) {
        opened.location.href = objectUrl
      } else {
        const link = document.createElement('a')

        link.href = objectUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        document.body.append(link)
        link.click()
        link.remove()
      }

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      opened?.close()
      setActionErrors(describeMediaApiError(error))
    } finally {
      setDownloadingId('')
    }
  }, [accessToken, api, downloadingId])

  const restoreFile = useCallback(async (file: MediaListItemResponse) => {
    if (!accessToken || mutating) return

    setMutating(true)
    setActionErrors([])

    try {
      await api.restore(file.mediaId, accessToken)
      setSuccessMessage(`${file.originalFileName} was restored.`)
      refresh()
    } catch (error) {
      setActionErrors(describeMediaApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, api, mutating])

  const confirmMutation = async () => {
    if (!accessToken || !confirmAction || mutating) return

    setMutating(true)
    setActionErrors([])

    try {
      if (confirmAction.kind === 'archive') {
        await api.archive(confirmAction.file.mediaId, accessToken)
        setSuccessMessage(`${confirmAction.file.originalFileName} was archived.`)
      } else {
        await api.deletePermanently(confirmAction.file.mediaId, accessToken)
        setSuccessMessage(`${confirmAction.file.originalFileName} was permanently deleted.`)
      }

      setConfirmAction(undefined)
      refresh()
    } catch (error) {
      setActionErrors(describeMediaApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const protectedActionsDisabled = !authenticated || unauthorized

  const columns = useMemo<Array<KbDataTableColumn<MediaListItemResponse>>>(
    () => [
      {
        id: 'preview',
        label: 'Preview',
        width: 72,
        hideable: false,
        render: file => <MediaPreview file={file} accessToken={accessToken} api={api} />
      },
      {
        id: 'fileName',
        label: 'Filename',
        render: file => (
          <Box sx={{ minInlineSize: 210, maxInlineSize: 320 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {file.originalFileName}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {file.fileExtension?.toUpperCase() || 'No extension'}
            </Typography>
          </Box>
        )
      },
      {
        id: 'type',
        label: 'Type',
        render: file => (
          <Box sx={{ minInlineSize: 150 }}>
            <Typography color='text.primary'>
              {mediaKindLabel[mediaKindFromMimeType(file.mimeType)]}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {file.mimeType}
            </Typography>
          </Box>
        )
      },
      {
        id: 'size',
        label: 'Size',
        render: file => formatFileSize(file.fileSizeBytes)
      },
      {
        id: 'uploadedBy',
        label: 'Uploader',
        render: file => file.uploadedBy.fullName
      },
      {
        id: 'uploadedAt',
        label: 'Uploaded',
        render: file => formatUploadedAt(file.uploadedAt)
      },
      {
        id: 'status',
        label: 'Status',
        render: file => (
          <Stack spacing={1} sx={{ alignItems: 'flex-start', minInlineSize: 120 }}>
            <StatusChip label={file.status} color={statusColor[file.status]} />
            {file.referenceCount ? (
              <Button
                size='small'
                variant='text'
                sx={{ minInlineSize: 0, p: 0, fontSize: 'caption.fontSize' }}
                onClick={() => setReferencesFile(file)}
              >
                {file.referenceCount} reference{file.referenceCount === 1 ? '' : 's'}
              </Button>
            ) : (
              <Typography variant='caption' color='text.secondary'>No references</Typography>
            )}
          </Stack>
        )
      },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: file => {
          const available = file.status === 'Active'
          const busy = downloadingId === file.mediaId || mutating

          return (
            <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end', minInlineSize: 150 }}>
              <Tooltip title={available ? 'Open' : 'Only active media can be opened'}>
                <span>
                  <IconButton
                    size='small'
                    aria-label={`Open ${file.originalFileName}`}
                    disabled={!available || busy}
                    onClick={() => void handleOpen(file)}
                  >
                    <ExternalLink size={18} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={available ? 'Download' : 'Only active media can be downloaded'}>
                <span>
                  <IconButton
                    size='small'
                    aria-label={`Download ${file.originalFileName}`}
                    disabled={!available || busy}
                    onClick={() => void handleDownload(file)}
                  >
                    <Download size={18} />
                  </IconButton>
                </span>
              </Tooltip>
              {available && ['image', 'gif'].includes(mediaKindFromMimeType(file.mimeType)) && (
                <Tooltip title='Replace image'>
                  <IconButton
                    size='small'
                    aria-label={`Replace ${file.originalFileName}`}
                    disabled={busy || protectedActionsDisabled}
                    onClick={() => {
                      setActionErrors([])
                      setReplaceFile(file)
                    }}
                  >
                    <ImageUp size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {file.status === 'Active' && (
                <Tooltip title='Archive'>
                  <IconButton
                    size='small'
                    aria-label={`Archive ${file.originalFileName}`}
                    disabled={busy}
                    onClick={() => {
                      setActionErrors([])
                      setConfirmAction({ kind: 'archive', file })
                    }}
                  >
                    <Archive size={18} />
                  </IconButton>
                </Tooltip>
              )}
              {file.status === 'Archived' && (
                <>
                  <Tooltip title='Restore'>
                    <IconButton
                      size='small'
                      aria-label={`Restore ${file.originalFileName}`}
                      disabled={busy}
                      onClick={() => void restoreFile(file)}
                    >
                      <RotateCcw size={18} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title='Delete permanently'>
                    <IconButton
                      size='small'
                      color='error'
                      aria-label={`Delete ${file.originalFileName} permanently`}
                      disabled={busy}
                      onClick={() => {
                        setActionErrors([])
                        setConfirmAction({ kind: 'delete', file })
                      }}
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          )
        }
      }
    ],
    [
      accessToken,
      api,
      downloadingId,
      formatUploadedAt,
      handleDownload,
      handleOpen,
      mutating,
      protectedActionsDisabled,
      restoreFile
    ]
  )

  const hasFilters = Boolean(debouncedSearch || mediaType || status)
  const loadFailed = loadErrors.length > 0 && !unauthorized
  return (
    <KbPageShell>
      <PageHeader
        title='Media Library'
        subtitle='Manage images, videos, documents, and attachments uploaded to the knowledge base.'
        actions={
          <Button
            variant='contained'
            startIcon={<Upload size={18} />}
            disabled={protectedActionsDisabled}
            onClick={() => {
              setActionErrors([])
              setUploadOpen(true)
            }}
          >
            Add media
          </Button>
        }
      />

      {unauthorized && (
        <Alert severity='warning'>
          <AlertTitle>Sign in required</AlertTitle>
          {authenticationMessage || missingTokenMessage}
        </Alert>
      )}
      {!unauthorized && <KbValidationSummary title='Media library could not be loaded' errors={loadErrors} />}
      <KbValidationSummary title='Media action could not be completed' errors={actionErrors} />
      {successMessage && (
        <Alert severity='success' onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      <KbDataTable
        ariaLabel='Media library table'
        loading={loading}
        rows={files}
        columns={columns}
        getRowId={file => file.mediaId}
        toolbar={
          <KbTableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder='Search by filename'
            filters={
              <>
                <KbTableFilter
                  select
                  value={mediaType}
                  onChange={event => {
                    setMediaType(event.target.value as MediaKind | '')
                    setPage(0)
                  }}
                  slotProps={{ htmlInput: { 'aria-label': 'Filter by media type' } }}
                  sx={{ inlineSize: { xs: '100%', sm: 164 } }}
                >
                  <MenuItem value=''>All media types</MenuItem>
                  {MEDIA_KIND_OPTIONS.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </KbTableFilter>
                <KbTableFilter
                  select
                  value={status}
                  onChange={event => {
                    setStatus(event.target.value as MediaStatus | '')
                    setPage(0)
                  }}
                  slotProps={{ htmlInput: { 'aria-label': 'Filter by status' } }}
                  sx={{ inlineSize: { xs: '100%', sm: 150 } }}
                >
                  <MenuItem value=''>All statuses</MenuItem>
                  {statusOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </KbTableFilter>
              </>
            }
          />
        }
        emptyState={{
          title: unauthorized
            ? 'Sign in required'
            : loadFailed
              ? 'Unable to load media'
              : hasFilters
                ? 'No matching media'
                : 'No media yet',
          description: unauthorized
            ? missingTokenMessage
            : loadFailed
              ? 'The backend request failed. Try loading the media library again.'
              : hasFilters
                ? 'No files match the current search and filters.'
                : 'Upload the first file to start building the media library.',
          action: loadFailed ? (
            <Button variant='outlined' onClick={refresh}>Retry</Button>
          ) : hasFilters ? (
            <Button
              variant='outlined'
              onClick={() => {
                setSearch('')
                setMediaType('')
                setStatus('')
                setPage(0)
              }}
            >
              Clear filters
            </Button>
          ) : authenticated ? (
            <Button variant='outlined' startIcon={<Upload size={18} />} onClick={() => setUploadOpen(true)}>
              Upload media
            </Button>
          ) : undefined
        }}
        pagination={{
          page,
          rowsPerPage: pageSize,
          totalRows: totalCount,
          onPageChange: setPage,
          onRowsPerPageChange: nextPageSize => {
            setPageSize(nextPageSize)
            setPage(0)
          }
        }}
      />

      <MediaUploadDialog
        open={uploadOpen}
        accessToken={accessToken}
        api={api}
        onClose={() => setUploadOpen(false)}
        onUploaded={count => {
          setSuccessMessage(`${count} file${count === 1 ? '' : 's'} added to the media library.`)
          setPage(0)
          refresh()
        }}
      />

      <MediaReferencesDialog
        open={Boolean(referencesFile)}
        file={referencesFile}
        accessToken={accessToken}
        lang={locale}
        api={api}
        onClose={() => setReferencesFile(undefined)}
      />

      <MediaReplaceDialog
        open={Boolean(replaceFile)}
        file={replaceFile}
        accessToken={accessToken}
        api={api}
        onClose={() => setReplaceFile(undefined)}
        onReplaced={replacementName => {
          setSuccessMessage(`${replacementName} now replaces the previous image everywhere it is referenced.`)
          setReplaceFile(undefined)
          refresh()
        }}
      />

      <KbConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.kind === 'archive' ? 'Archive media?' : 'Delete media permanently?'}
        description={
          confirmAction?.kind === 'archive'
            ? `Archive “${confirmAction.file.originalFileName}”? Existing references remain recorded, but the file cannot be opened until it is restored.`
            : confirmAction
              ? `Permanently delete “${confirmAction.file.originalFileName}”? This cannot be undone. Files with existing references cannot be deleted.`
              : ''
        }
        confirmLabel={confirmAction?.kind === 'archive' ? 'Archive' : 'Delete permanently'}
        confirmColor={confirmAction?.kind === 'archive' ? 'warning' : 'error'}
        submitting={mutating}
        onClose={() => {
          if (!mutating) {
            setConfirmAction(undefined)
            setActionErrors([])
          }
        }}
        onConfirm={() => void confirmMutation()}
      />
    </KbPageShell>
  )
}

export default MediaLibraryPage
