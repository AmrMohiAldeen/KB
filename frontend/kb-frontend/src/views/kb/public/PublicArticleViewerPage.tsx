'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, Clock, RefreshCw } from 'lucide-react'
import { ApiError, describeApiError } from '@/lib/api/http'
import { getPublicArticle, type PublicArticle } from '@/lib/api/publicKnowledgeBaseApi'
import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'
import { KbPageShell } from '@/views/shared'
import EmptyState from '../shared/components/EmptyState'
import { formatDate } from '../shared/utils/formatDate'

export default function PublicArticleViewerPage({
  lang,
  slug,
  initialArticle
}: {
  lang: string
  slug: string
  initialArticle: PublicArticle
}) {
  const [article, setArticle] = useState<PublicArticle | null>(initialArticle)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [messages, setMessages] = useState<string[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setLoading(true)
    setNotFound(false)
    setMessages([])
    setRefreshKey(value => value + 1)
  }, [])

  useEffect(() => {
    if (refreshKey === 0) return
    const controller = new AbortController()
    getPublicArticle(slug, controller.signal)
      .then(value => setArticle(value))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setArticle(null)
        if (error instanceof ApiError && error.status === 404) setNotFound(true)
        else setMessages(describeApiError(error))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey, slug])

  return (
    <KbPageShell>
      <Stack spacing={4} sx={{ maxInlineSize: 1040, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
          <Button component={Link} href={`/${lang}/kb`} startIcon={<ArrowLeft size={18} />}>Knowledge Base</Button>
          <Button variant='outlined' startIcon={<RefreshCw size={16} />} disabled={loading} onClick={refresh}>Reload</Button>
        </Box>
        {messages.map(message => <Alert key={message} severity='error'>{message}</Alert>)}
        <Card variant='outlined'>
          <CardContent sx={{ p: { xs: 4, md: 7 } }}>
            {loading ? (
              <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
                <CircularProgress size={22} /><Typography>Loading article…</Typography>
              </Stack>
            ) : article ? (
              <Stack spacing={5}>
                <Breadcrumbs aria-label='Article breadcrumbs'>
                  <Link href={`/${lang}/kb`}>Knowledge Base</Link>
                  <Typography color='text.secondary'>{article.categoryName}</Typography>
                </Breadcrumbs>
                <Box>
                  <Typography variant='h3' color='text.primary'>{article.title}</Typography>
                  <Stack direction='row' spacing={1} sx={{ mt: 2, color: 'text.secondary', alignItems: 'center' }}>
                    <Clock size={16} /><Typography variant='body2'>Updated {formatDate(article.updatedAt)}</Typography>
                  </Stack>
                </Box>
                <Divider />
                <KnowledgeBaseViewer content={article.content} />
              </Stack>
            ) : notFound ? (
              <EmptyState title='Article not found' body='This article is unavailable or does not exist.' />
            ) : (
              <EmptyState title='Article unavailable' body='Try again or return to the Knowledge Base.' />
            )}
          </CardContent>
        </Card>
      </Stack>
    </KbPageShell>
  )
}
