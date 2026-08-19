'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ApiError, describeApiError } from '@/lib/api/http'
import { getViewerArticle, getViewerPreviewArticle, type ViewerArticle } from '@/lib/api/viewerKnowledgeBaseApi'
import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'
import { formatDate } from '../shared/utils/formatDate'

type ViewerArticlePageProps =
  | { solutionSlug: string; articleSlug: string; preview?: never }
  | { solutionSlug?: never; articleSlug: string; preview: { categoryId: string; accessToken: string } }

export default function ViewerArticlePage({ solutionSlug, articleSlug, preview }: ViewerArticlePageProps) {
  const [article, setArticle] = useState<ViewerArticle | null>(null)
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    const controller = new AbortController()
    const request = preview
      ? getViewerPreviewArticle(preview.categoryId, articleSlug, preview.accessToken, controller.signal)
      : getViewerArticle(solutionSlug, articleSlug, controller.signal)
    request.then(setArticle).catch(value => {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value)
    })
    return () => controller.abort()
  }, [articleSlug, preview, solutionSlug])

  if (error) return <Alert severity={error instanceof ApiError && error.status === 403 ? 'warning' : 'error'}>{error instanceof ApiError && error.status === 403 ? 'You do not have access to this solution.' : describeApiError(error).join(' ')}</Alert>
  if (!article) return <Stack direction='row' spacing={2}><CircularProgress size={24} /><Typography>Loading article…</Typography></Stack>

  return <Stack spacing={5} sx={{ maxInlineSize: 1040, mx: 'auto' }}>
    {preview && <Alert severity='info'>Preview mode — Viewing as end user</Alert>}
    <Breadcrumbs><Link href={preview ? `/viewer/preview/${preview.categoryId}` : `/${solutionSlug}`}>Knowledge Base</Link><Typography color='text.secondary'>{article.categoryName}</Typography></Breadcrumbs>
    <Box><Typography variant='h3'>{article.title}</Typography><Typography color='text.secondary'>Updated {formatDate(article.updatedAt)}</Typography></Box>
    <Divider /><KnowledgeBaseViewer content={article.content} />
  </Stack>
}
