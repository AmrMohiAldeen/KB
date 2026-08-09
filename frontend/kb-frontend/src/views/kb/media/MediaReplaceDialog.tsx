'use client'

import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ImageUp } from 'lucide-react'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { describeMediaApiError } from '@/lib/api/mediaApi'
import type { MediaListItemResponse } from '@/types/apps/mediaTypes'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import { mediaKindFromMimeType, validateMediaFile } from './utils/mediaValidation'

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff'

export default function MediaReplaceDialog({
  open,
  file,
  accessToken,
  api,
  onClose,
  onReplaced
}: {
  open: boolean
  file?: MediaListItemResponse
  accessToken: string
  api: MediaLibraryApi
  onClose: () => void
  onReplaced: (replacementName: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [replacement, setReplacement] = useState<File>()
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    if (submitting) return
    setReplacement(undefined)
    setErrors([])
    setProgress(0)
    onClose()
  }

  const select = (selected?: File) => {
    setReplacement(selected)
    setProgress(0)
    if (!selected) {
      setErrors([])
      return
    }
    const validation = validateMediaFile(selected)
    const kind = mediaKindFromMimeType(selected.type)
    if (kind !== 'image' && kind !== 'gif') validation.push('The replacement file must be an image or GIF.')
    setErrors(validation)
  }

  const submit = async () => {
    if (!file || !replacement || submitting) {
      if (!replacement) setErrors(['Choose a replacement image.'])
      return
    }
    const validation = validateMediaFile(replacement)
    const kind = mediaKindFromMimeType(replacement.type)
    if (kind !== 'image' && kind !== 'gif') validation.push('The replacement file must be an image or GIF.')
    if (validation.length) {
      setErrors(validation)
      return
    }

    setSubmitting(true)
    setErrors([])
    try {
      await api.replace(file.mediaId, replacement, accessToken, value => setProgress(value.percent))
      const name = replacement.name
      setReplacement(undefined)
      setErrors([])
      setProgress(0)
      onClose()
      onReplaced(name)
    } catch (error) {
      setErrors(describeMediaApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KbFormDialog
      open={open}
      title='Replace image'
      description={`Replace ${file?.originalFileName ?? 'this image'} everywhere it is actively referenced.`}
      submitLabel='Replace image'
      submitting={submitting}
      onClose={close}
      onSubmit={() => void submit()}
    >
      <Stack spacing={3}>
        <Alert severity='info'>
          The media ID and references stay the same. The previous binary is retained for history and audit recovery.
        </Alert>
        <Box sx={{ border: 1, borderStyle: 'dashed', borderColor: 'divider', borderRadius: 2, p: 4 }}>
          <Button variant='outlined' startIcon={<ImageUp size={18} />} onClick={() => inputRef.current?.click()}>
            Upload from device
          </Button>
          <input
            ref={inputRef}
            hidden
            type='file'
            accept={IMAGE_ACCEPT}
            onChange={event => {
              select(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
            {replacement ? replacement.name : 'Choose a JPG, PNG, GIF, WebP, BMP, or TIFF image.'}
          </Typography>
        </Box>
        {submitting && <LinearProgress variant='determinate' value={progress} aria-label='Replacing image' />}
        {errors.length > 0 && <Alert severity='error'>{errors.join(' ')}</Alert>}
      </Stack>
    </KbFormDialog>
  )
}
