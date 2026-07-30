'use client'

import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { FileUp, RotateCcw, Trash2, UploadCloud } from 'lucide-react'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { describeMediaApiError } from '@/lib/api/mediaApi'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import {
  MEDIA_FILE_ACCEPT,
  MAX_MEDIA_FILE_SIZE_BYTES,
  SUPPORTED_MEDIA_EXTENSIONS,
  formatFileSize,
  validateMediaFile
} from './utils/mediaValidation'

type UploadStatus = 'ready' | 'invalid' | 'uploading' | 'success' | 'error'

type UploadEntry = {
  id: string
  file: File
  status: UploadStatus
  progress: number
  errors: string[]
}

type MediaUploadDialogProps = {
  open: boolean
  accessToken: string
  api: MediaLibraryApi
  onClose: () => void
  onUploaded: (count: number) => void
}

let entrySequence = 0

const createEntry = (file: File): UploadEntry => {
  const errors = validateMediaFile(file)

  entrySequence += 1

  return {
    id: `${Date.now()}-${entrySequence}`,
    file,
    status: errors.length ? 'invalid' : 'ready',
    progress: 0,
    errors
  }
}

const statusLabel: Record<UploadStatus, string> = {
  ready: 'Ready',
  invalid: 'Invalid',
  uploading: 'Uploading',
  success: 'Uploaded',
  error: 'Failed'
}

const statusColor: Record<UploadStatus, 'default' | 'error' | 'info' | 'success' | 'warning'> = {
  ready: 'default',
  invalid: 'error',
  uploading: 'info',
  success: 'success',
  error: 'error'
}

const MediaUploadDialog = ({ open, accessToken, api, onClose, onUploaded }: MediaUploadDialogProps) => {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const successCount = entries.filter(entry => entry.status === 'success').length
  const failureCount = entries.filter(entry => entry.status === 'error' || entry.status === 'invalid').length
  const readyCount = entries.filter(entry => entry.status === 'ready' || entry.status === 'error').length
  const supportedSummary = useMemo(
    () => SUPPORTED_MEDIA_EXTENSIONS.map(extension => extension.slice(1).toUpperCase()).join(', '),
    []
  )

  const updateEntry = (id: string, update: Partial<UploadEntry>) => {
    setEntries(current => current.map(entry => entry.id === id ? { ...entry, ...update } : entry))
  }

  const addFiles = (files: FileList | File[]) => {
    setEntries(current => [...current, ...Array.from(files, createEntry)])
  }

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const uploadEntries = async (onlyIds?: string[]) => {
    if (!accessToken || uploading) return

    const candidates = entries.filter(entry =>
      (entry.status === 'ready' || entry.status === 'error') &&
      (!onlyIds || onlyIds.includes(entry.id))
    )

    if (!candidates.length) return

    setUploading(true)
    let completed = 0

    for (const entry of candidates) {
      updateEntry(entry.id, { status: 'uploading', progress: 0, errors: [] })

      try {
        await api.upload(entry.file, accessToken, progress => {
          updateEntry(entry.id, { progress: progress.percent })
        })
        completed += 1
        updateEntry(entry.id, { status: 'success', progress: 100, errors: [] })
      } catch (error) {
        updateEntry(entry.id, {
          status: 'error',
          progress: 0,
          errors: describeMediaApiError(error)
        })
      }
    }

    setUploading(false)
    if (completed) onUploaded(completed)
  }

  const closeDialog = () => {
    if (uploading) return

    setEntries([])
    setDragging(false)
    onClose()
  }

  return (
    <KbFormDialog
      open={open}
      title='Upload media'
      description='Select one or more files. Each file is validated and uploaded separately.'
      submitLabel={readyCount ? `Upload ${readyCount} file${readyCount === 1 ? '' : 's'}` : 'Upload files'}
      submitting={uploading}
      maxWidth='md'
      onClose={closeDialog}
      onSubmit={() => void uploadEntries()}
    >
      <Stack spacing={4}>
        <Box
          onDragEnter={event => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={event => {
            if (event.currentTarget === event.target) setDragging(false)
          }}
          onDrop={handleDrop}
          sx={theme => ({
            border: `2px dashed ${dragging ? theme.palette.primary.main : theme.palette.divider}`,
            borderRadius: 2,
            bgcolor: dragging ? 'action.hover' : 'background.default',
            p: { xs: 4, sm: 6 },
            textAlign: 'center',
            transition: theme.transitions.create(['border-color', 'background-color'])
          })}
        >
          <UploadCloud size={34} color='var(--mui-palette-primary-main)' />
          <Typography variant='h6' sx={{ mt: 2 }}>
            Drop files here
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
            or choose files from your device
          </Typography>
          <Button
            variant='outlined'
            startIcon={<FileUp size={18} />}
            onClick={() => inputRef.current?.click()}
            sx={{ mt: 3 }}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            hidden
            multiple
            type='file'
            accept={MEDIA_FILE_ACCEPT}
            onChange={handleFileInput}
          />
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 3 }}>
            Up to {formatFileSize(MAX_MEDIA_FILE_SIZE_BYTES)} per file
          </Typography>
          <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 0.5 }}>
            {supportedSummary}
          </Typography>
        </Box>

        {successCount > 0 && failureCount === 0 && (
          <Alert severity='success'>
            {successCount} file{successCount === 1 ? '' : 's'} uploaded successfully.
          </Alert>
        )}
        {successCount > 0 && failureCount > 0 && (
          <Alert severity='warning'>
            {successCount} file{successCount === 1 ? '' : 's'} uploaded; {failureCount} need attention.
          </Alert>
        )}
        {successCount === 0 && failureCount > 0 && (
          <Alert severity='error'>
            {failureCount} file{failureCount === 1 ? '' : 's'} could not be uploaded.
          </Alert>
        )}

        {entries.length > 0 && (
          <Stack spacing={2} aria-label='Upload queue'>
            {entries.map(entry => (
              <Box
                key={entry.id}
                sx={theme => ({
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2,
                  p: 3
                })}
              >
                <Stack direction='row' spacing={2} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minInlineSize: 0 }}>
                    <Typography color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {entry.file.name}
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {formatFileSize(entry.file.size)}
                    </Typography>
                  </Box>
                  <Chip
                    size='small'
                    label={statusLabel[entry.status]}
                    color={statusColor[entry.status]}
                    variant='tonal'
                  />
                  {entry.status === 'error' && (
                    <IconButton
                      size='small'
                      aria-label={`Retry ${entry.file.name}`}
                      disabled={uploading}
                      onClick={() => void uploadEntries([entry.id])}
                    >
                      <RotateCcw size={17} />
                    </IconButton>
                  )}
                  {entry.status !== 'uploading' && (
                    <IconButton
                      size='small'
                      aria-label={`Remove ${entry.file.name}`}
                      disabled={uploading}
                      onClick={() => setEntries(current => current.filter(item => item.id !== entry.id))}
                    >
                      <Trash2 size={17} />
                    </IconButton>
                  )}
                </Stack>

                {entry.status === 'uploading' && (
                  <Stack direction='row' spacing={2} sx={{ alignItems: 'center', mt: 2 }}>
                    <LinearProgress
                      variant='determinate'
                      value={entry.progress}
                      aria-label={`Uploading ${entry.file.name}`}
                      sx={{ flex: 1 }}
                    />
                    <Typography variant='caption' color='text.secondary'>
                      {entry.progress}%
                    </Typography>
                  </Stack>
                )}

                {entry.errors.map(error => (
                  <Typography key={error} variant='body2' color='error' sx={{ mt: 1 }}>
                    {error}
                  </Typography>
                ))}
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </KbFormDialog>
  )
}

export default MediaUploadDialog
