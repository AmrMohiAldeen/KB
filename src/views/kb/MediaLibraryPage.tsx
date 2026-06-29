'use client'

import { useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { FileImage, FileText, RefreshCw, Trash2, Upload } from 'lucide-react'

import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'

import { KbPageShell, PageHeader, StatusChip } from './KbShared'
import { emptyMediaFiles } from './kbMockData'
import type { MediaFile } from './kbMockData'

const MediaLibraryPage = () => {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'fileName', direction: 'asc' })
  const [replaceFile, setReplaceFile] = useState<MediaFile | null>(null)
  const files = emptyMediaFiles

  const visibleFiles = useMemo(() => {
    // TODO: connect to backend media API.
    // GET /api/kb/media should accept search, mimeType, reference status, page, and sort.
    const needle = search.trim().toLowerCase()

    return [...files]
      .filter(file =>
        needle ? `${file.fileName} ${file.mimeType} ${file.uploadedByName}`.toLowerCase().includes(needle) : true
      )
      .sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1
        const aValue = String(a[sort.columnId as keyof MediaFile] ?? '')
        const bValue = String(b[sort.columnId as keyof MediaFile] ?? '')

        return aValue.localeCompare(bValue) * direction
      })
  }, [files, search, sort])

  const handleUpload = () => {
    // TODO: connect to backend upload API.
    // POST /api/kb/media should upload through object storage and return MediaFile metadata.
  }

  const handleReplace = () => {
    // TODO: connect to backend replace API.
    // POST /api/kb/media/{mediaFileId}/replace should replace object storage content and update references.
    setReplaceFile(null)
  }

  const columns = useMemo<Array<KbDataTableColumn<MediaFile>>>(
    () => [
      {
        id: 'fileName',
        label: 'Name',
        sortable: true,
        render: file => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minInlineSize: 260 }}>
            {file.mimeType.startsWith('image/') ? (
              <FileImage size={22} color='var(--mui-palette-primary-main)' />
            ) : (
              <FileText size={22} color='var(--mui-palette-text-secondary)' />
            )}
            <Box sx={{ minInlineSize: 0 }}>
              <Typography color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                {file.fileName}
              </Typography>
              <Typography variant='body2' color='text.secondary'>
                {file.sizeLabel}
              </Typography>
            </Box>
          </Box>
        )
      },
      { id: 'mimeType', label: 'Type', sortable: true, render: file => file.mimeType },
      { id: 'uploadedByName', label: 'Uploaded By', sortable: true, render: file => file.uploadedByName },
      { id: 'uploadedAt', label: 'Uploaded', sortable: true, render: file => file.uploadedAt },
      {
        id: 'referenceCount',
        label: 'References',
        sortable: true,
        render: file => (
          <StatusChip
            label={file.referenceCount ? `${file.referenceCount} references` : 'Unreferenced'}
            color={file.referenceCount ? 'success' : 'warning'}
          />
        )
      },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: file => (
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
        )
      }
    ],
    []
  )

  return (
    <KbPageShell>
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

      <KbDataTable
        ariaLabel='Media library table'
        rows={visibleFiles}
        columns={columns}
        getRowId={file => file.id}
        sort={sort}
        onSortChange={setSort}
        toolbar={
          <KbTableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder='Search by file name'
          />
        }
        emptyState={{
          title: 'No media loaded',
          description: 'Uploaded files will appear here after the backend media API is connected.'
        }}
        pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleFiles.length }}
      />

      <KbFormDialog
        open={Boolean(replaceFile)}
        title='Replace File'
        description={replaceFile?.fileName}
        submitLabel='Replace'
        onClose={() => setReplaceFile(null)}
        onSubmit={handleReplace}
      >
        <Button variant='outlined' component='label' startIcon={<Upload size={18} />}>
          Choose File
          <input hidden type='file' />
        </Button>
        <Typography color='text.secondary' sx={{ mt: 3 }}>
          Current article references will point to the replacement file after the backend replace API is connected.
        </Typography>
      </KbFormDialog>
    </KbPageShell>
  )
}

export default MediaLibraryPage
