'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import {
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo
} from 'lucide-react'
import type { MediaListItemResponse } from '@/types/apps/mediaTypes'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { mediaKindFromMimeType } from './utils/mediaValidation'

type MediaIconProps = {
  mimeType: string
  size?: number
}

export const MediaIcon = ({ mimeType, size = 22 }: MediaIconProps) => {
  const kind = mediaKindFromMimeType(mimeType)

  if (kind === 'image' || kind === 'gif') return <FileImage size={size} />
  if (kind === 'video') return <FileVideo size={size} />
  if (kind === 'pdf') return <FileType2 size={size} />
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return <FileSpreadsheet size={size} />

  return <FileText size={size} />
}

type MediaPreviewProps = {
  file: MediaListItemResponse
  accessToken: string
  api: MediaLibraryApi
}

const PreviewFrame = ({ children }: { children: ReactNode }) => (
  <Avatar
    variant='rounded'
    sx={{
      inlineSize: 46,
      blockSize: 46,
      bgcolor: 'action.hover',
      color: 'text.secondary',
      overflow: 'hidden'
    }}
  >
    {children}
  </Avatar>
)

const AuthenticatedImagePreview = ({ file, accessToken, api }: MediaPreviewProps) => {
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''

    api.getContent(file.mediaId, accessToken, controller.signal).then(blob => {
      if (controller.signal.aborted) return

      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFailed(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accessToken, api, file.mediaId])

  return (
    <PreviewFrame>
      {loading ? (
        <CircularProgress size={18} />
      ) : source && !failed ? (
        <Box
          component='img'
          src={source}
          alt={`Preview of ${file.originalFileName}`}
          loading='lazy'
          onError={() => setFailed(true)}
          sx={{ inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }}
        />
      ) : (
        <MediaIcon mimeType={file.mimeType} />
      )}
    </PreviewFrame>
  )
}

const MediaPreview = ({ file, accessToken, api }: MediaPreviewProps) => {
  const kind = mediaKindFromMimeType(file.mimeType)
  const canPreview = file.status === 'Active' && (kind === 'image' || kind === 'gif')

  if (canPreview && accessToken)
    return <AuthenticatedImagePreview key={file.mediaId} file={file} accessToken={accessToken} api={api} />

  return (
    <PreviewFrame>
      <MediaIcon mimeType={file.mimeType} />
    </PreviewFrame>
  )
}

export default MediaPreview
