'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { describeMediaApiError } from '@/lib/api/mediaApi'
import type { MediaListItemResponse, MediaReferenceDetailsResponse } from '@/types/apps/mediaTypes'
import { getLocalizedUrl } from '@/utils/i18n'

type ReferenceGroup = {
  key: string
  articleId: string | null
  articleTitle: string
  articleStatus: string | null
  references: MediaReferenceDetailsResponse[]
}

const contextLabel = (reference: MediaReferenceDetailsResponse) => {
  if (reference.referenceEntityType === 'Version')
    return reference.versionNumber ? `Version ${reference.versionNumber}` : 'Article version'
  if (reference.referenceEntityType === 'Draft') return 'Current draft'
  if (reference.referenceEntityType === 'Attachment') return 'Article attachment'
  if (reference.referenceEntityType === 'Comment') return 'Article comment'
  return 'Reusable block'
}

const referenceUrl = (reference: MediaReferenceDetailsResponse, lang: string) => {
  if (!reference.articleId || reference.articleStatus === 'Archived' || reference.articleStatus === 'Deleted')
    return null
  if (reference.referenceEntityType === 'Version')
    return getLocalizedUrl(
      `/editor/versions/${encodeURIComponent(reference.referenceEntityId)}?articleId=${encodeURIComponent(reference.articleId)}`,
      lang
    )
  return getLocalizedUrl(`/editor?articleId=${encodeURIComponent(reference.articleId)}`, lang)
}

export default function MediaReferencesDialog({
  open,
  file,
  accessToken,
  lang,
  api,
  onClose
}: {
  open: boolean
  file?: MediaListItemResponse
  accessToken: string
  lang: string
  api: MediaLibraryApi
  onClose: () => void
}) {
  const [references, setReferences] = useState<MediaReferenceDetailsResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open || !file) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setErrors([])
      setReferences([])
      void api.getReferences(file.mediaId, accessToken, controller.signal).then(
        setReferences,
        error => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setErrors(describeMediaApiError(error))
        }
      ).finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, api, file, open])

  const groups = useMemo(() => {
    const grouped = new Map<string, ReferenceGroup>()
    references.forEach(reference => {
      const key = reference.articleId ?? `non-article:${reference.referenceId}`
      const current = grouped.get(key)
      if (current) current.references.push(reference)
      else grouped.set(key, {
        key,
        articleId: reference.articleId,
        articleTitle: reference.articleTitle ?? 'Non-article content',
        articleStatus: reference.articleStatus,
        references: [reference]
      })
    })
    return [...grouped.values()]
  }, [references])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>References for {file?.originalFileName ?? 'media'}</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Stack direction='row' spacing={2} sx={{ alignItems: 'center', py: 3 }}>
            <CircularProgress size={22} />
            <Typography color='text.secondary'>Loading references…</Typography>
          </Stack>
        )}
        {errors.length > 0 && <Alert severity='error'>{errors.join(' ')}</Alert>}
        {!loading && errors.length === 0 && groups.length === 0 && (
          <Typography color='text.secondary'>This media item has no active references.</Typography>
        )}
        <Stack spacing={2}>
          {groups.map(group => {
            const destination = referenceUrl(group.references[0], lang)
            return (
              <Stack key={group.key} spacing={1} sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontWeight: 700 }}>{group.articleTitle}</Typography>
                  {destination && (
                    <Link href={destination} className='text-sm font-medium text-primary hover:underline'>
                      Open article
                    </Link>
                  )}
                </Stack>
                {group.articleStatus && (
                  <Typography variant='caption' color='text.secondary'>Status: {group.articleStatus}</Typography>
                )}
                <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {group.references.map(reference => (
                    <Chip key={reference.referenceId} size='small' variant='outlined' label={contextLabel(reference)} />
                  ))}
                </Stack>
              </Stack>
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
