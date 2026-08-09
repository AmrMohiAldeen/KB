'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Activity, X } from 'lucide-react'
import { describeLifecycleError, getArticleReviewHistory } from '@/lib/api/articleLifecycleApi'
import type { ArticleReviewEventResponse } from '@/types/apps/articleLifecycleTypes'
import { articleStatusLabel } from '@/views/kb/config/articles'

type ArticleActivityDrawerProps = {
  articleId: string
  accessToken: string
  open: boolean
  onClose: () => void
  locale?: string
}

const humanize = (value: string) => value
  .replace(/^Article/, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .trim()

export default function ArticleActivityDrawer({
  articleId,
  accessToken,
  open,
  onClose,
  locale = 'en'
}: ArticleActivityDrawerProps) {
  const [items, setItems] = useState<ArticleReviewEventResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setErrors([])
      getArticleReviewHistory(articleId, accessToken, controller.signal)
        .then(result => setItems([...result].sort((left, right) => right.createdAt.localeCompare(left.createdAt))))
        .catch(error => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setErrors(describeLifecycleError(error))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, articleId, open])

  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }), [locale])

  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={onClose}
      slotProps={{ paper: { sx: { inlineSize: { xs: '100%', sm: 420 }, maxInlineSize: '100%' } } }}
    >
      <Stack sx={{ minBlockSize: '100%' }}>
        <Stack direction='row' spacing={2} sx={{ alignItems: 'center', px: 3, py: 2.5, borderBottom: 1, borderColor: 'divider' }}>
          <Activity size={20} />
          <Box sx={{ flex: 1 }}>
            <Typography variant='h6'>Revision history</Typography>
            <Typography variant='caption' color='text.secondary'>Article lifecycle and state transitions</Typography>
          </Box>
          <IconButton aria-label='Close activity' onClick={onClose}><X size={19} /></IconButton>
        </Stack>
        <Box sx={{ p: 3 }}>
          {loading && (
            <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
              <CircularProgress size={20} />
              <Typography variant='body2'>Loading activity…</Typography>
            </Stack>
          )}
          {errors.length > 0 && <Alert severity='warning'>{errors.join(' ')}</Alert>}
          {!loading && errors.length === 0 && items.length === 0 && (
            <Typography variant='body2' color='text.secondary'>No lifecycle transitions have been recorded.</Typography>
          )}
          <Stack spacing={0}>
            {items.map(item => (
              <Box key={item.reviewEventId} sx={{ position: 'relative', pb: 3, pl: 3, '&:not(:last-child)::before': {
                content: '""', position: 'absolute', insetInlineStart: 5, insetBlockStart: 14, insetBlockEnd: -2,
                borderInlineStart: 1, borderColor: 'divider'
              } }}>
                <Box sx={{ position: 'absolute', insetInlineStart: 0, insetBlockStart: 6, inlineSize: 11, blockSize: 11, borderRadius: '50%', bgcolor: 'primary.main', boxShadow: theme => `0 0 0 4px ${theme.palette.background.paper}` }} />
                <Typography variant='body2' sx={{ fontWeight: 700 }}>
                  {item.fromStatus ? articleStatusLabel[item.fromStatus] : 'Started'} → {articleStatusLabel[item.toStatus]}
                </Typography>
                <Typography variant='body2'>{humanize(item.action)} by {item.actor.fullName}</Typography>
                <Typography variant='caption' color='text.secondary'>{formatter.format(new Date(item.createdAt))}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Drawer>
  )
}
