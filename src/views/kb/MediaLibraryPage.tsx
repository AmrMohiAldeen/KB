'use client'

import { useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { FileImage, FileText, RefreshCw, Search, Trash2, Upload } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import { PageHeader, StatusChip } from './KbShared'
import { mediaFiles } from './kbMockData'
import type { MediaFile } from './kbMockData'

const previewColors: Record<MediaFile['previewTone'], string> = {
  blue: 'var(--mui-palette-primary-lightOpacity)',
  green: 'var(--mui-palette-success-lightOpacity)',
  amber: 'var(--mui-palette-warning-lightOpacity)',
  violet: 'var(--mui-palette-secondary-lightOpacity)',
  slate: 'var(--mui-palette-action-hover)'
}

const MediaLibraryPage = () => {
  const [search, setSearch] = useState('')
  const [replaceFile, setReplaceFile] = useState<MediaFile | null>(null)

  const visibleFiles = useMemo(() => {
    // TODO: connect to backend media API.
    // GET /api/kb/media should accept search, mimeType, reference status, page, and sort.
    const needle = search.trim().toLowerCase()

    return mediaFiles.filter(file =>
      needle ? `${file.fileName} ${file.mimeType} ${file.uploadedBy}`.toLowerCase().includes(needle) : true
    )
  }, [search])

  const handleUpload = () => {
    // TODO: connect to backend upload API.
    // POST /api/kb/media should upload through object storage and return MediaFile metadata.
  }

  const handleReplace = () => {
    // TODO: connect to backend replace API.
    // POST /api/kb/media/{mediaFileId}/replace should replace object storage content and update references.
    setReplaceFile(null)
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Media Library'
        subtitle='Manage images and files uploaded from the editor.'
        actions={
          <Button variant='contained' component='label' startIcon={<Upload size={18} />} onClick={handleUpload}>
            Add New File
            <input hidden type='file' />
          </Button>
        }
      />

      <CustomTextField
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder='Search by file name'
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position='start'>
                <Search size={18} />
              </InputAdornment>
            )
          }
        }}
      />

      <Box className='grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4'>
        {visibleFiles.map(file => (
          <Card key={file.id} variant='outlined'>
            <CardContent>
              <Stack spacing={4}>
                <Box
                  className='flex aspect-video items-center justify-center rounded'
                  sx={{ backgroundColor: previewColors[file.previewTone] }}
                >
                  {file.mimeType.startsWith('image/') ? (
                    <FileImage size={44} className='text-primary' />
                  ) : (
                    <FileText size={44} className='text-textSecondary' />
                  )}
                </Box>
                <Box>
                  <Typography color='primary.main' className='break-words font-medium'>
                    {file.fileName}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    {file.mimeType} / {file.size}
                  </Typography>
                  <Typography variant='body2' color='text.secondary'>
                    Uploaded by {file.uploadedBy}
                  </Typography>
                </Box>
                <Box className='flex items-center justify-between gap-3'>
                  <StatusChip
                    label={file.references ? `${file.references} references` : 'Unreferenced'}
                    color={file.references ? 'success' : 'warning'}
                  />
                  <Box>
                    <Tooltip title='Replace file'>
                      <IconButton size='small' onClick={() => setReplaceFile(file)}>
                        <RefreshCw size={18} />
                      </IconButton>
                    </Tooltip>
                    {/* TODO: connect to backend reference-check and delete APIs.
                        Deleting should call a safe server endpoint after checking article references; never delete real files directly in UI logic. */}
                    <Tooltip title='Delete'>
                      <span>
                        <IconButton size='small' disabled>
                          <Trash2 size={18} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Dialog open={Boolean(replaceFile)} onClose={() => setReplaceFile(null)} fullWidth maxWidth='sm'>
        <DialogTitle>Replace File</DialogTitle>
        <DialogContent>
          <Stack spacing={4} className='pbs-2'>
            <Typography color='text.secondary'>{replaceFile?.fileName}</Typography>
            <Button variant='outlined' component='label' startIcon={<Upload size={18} />}>
              Choose File
              <input hidden type='file' />
            </Button>
            <Typography color='text.primary'>
              Current article references will point to the replacement file.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions className='pli-6 pbs-0 pbe-6'>
          <Button variant='tonal' color='secondary' onClick={() => setReplaceFile(null)}>
            Cancel
          </Button>
          <Button variant='contained' onClick={handleReplace}>
            Replace
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default MediaLibraryPage
