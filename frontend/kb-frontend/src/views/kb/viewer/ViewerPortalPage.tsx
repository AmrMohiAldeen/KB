'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BookOpen, ChevronRight, Search } from 'lucide-react'
import CustomTextField from '@core/components/mui/TextField'
import { ApiError, describeApiError } from '@/lib/api/http'
import {
  getViewerArticles,
  getViewerCategories,
  getViewerPortal,
  getViewerPreviewArticles,
  getViewerPreviewCategories,
  getViewerPreviewPortal,
  searchViewerArticles,
  searchViewerPreviewArticles,
  type ViewerArticleSummary,
  type ViewerCategoryNode,
  type ViewerPortal
} from '@/lib/api/viewerKnowledgeBaseApi'

type ViewerPortalPageProps =
  | { solutionSlug: string; preview?: never }
  | { solutionSlug?: never; preview: { categoryId: string; accessToken: string } }

const categoryIds = (category: ViewerCategoryNode): Set<string> => {
  const values = new Set<string>([category.categoryId])
  category.children.forEach(child => categoryIds(child).forEach(id => values.add(id)))
  return values
}

export default function ViewerPortalPage({ solutionSlug, preview }: ViewerPortalPageProps) {
  const [portal, setPortal] = useState<ViewerPortal | null>(null)
  const [categories, setCategories] = useState<ViewerCategoryNode[]>([])
  const [articles, setArticles] = useState<ViewerArticleSummary[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  const rootId = preview?.categoryId ?? solutionSlug!
  const articleBasePath = preview ? `/viewer/preview/${preview.categoryId}` : `/${solutionSlug}`

  useEffect(() => {
    const controller = new AbortController()

    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setLoading(true)
      setError(undefined)
      setPortal(null)
      setCategories([])
      setArticles([])
    })
    const requests = preview
      ? [
          getViewerPreviewPortal(preview.categoryId, preview.accessToken, controller.signal),
          getViewerPreviewCategories(preview.categoryId, preview.accessToken, controller.signal),
          getViewerPreviewArticles(preview.categoryId, preview.accessToken, controller.signal)
        ] as const
      : [
          getViewerPortal(solutionSlug, controller.signal),
          getViewerCategories(solutionSlug, controller.signal),
          getViewerArticles(solutionSlug, controller.signal)
        ] as const

    Promise.all(requests).then(([portalValue, categoryRows, articleRows]) => {
      setPortal(portalValue)
      setCategories(categoryRows)
      setArticles(articleRows)
    }).catch(value => {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [preview, rootId, solutionSlug])

  useEffect(() => {
    const trimmed = query.trim()
    if (!portal || !trimmed) {
      if (portal && query === '') {
        const request = preview
          ? getViewerPreviewArticles(preview.categoryId, preview.accessToken)
          : getViewerArticles(solutionSlug)
        request.then(setArticles).catch(setError)
      }
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const request = preview
        ? searchViewerPreviewArticles(preview.categoryId, trimmed, preview.accessToken, controller.signal)
        : searchViewerArticles(solutionSlug, trimmed, controller.signal)
      request.then(setArticles).catch(value => {
        if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value)
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [portal, preview, query, solutionSlug])

  if (loading) return <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}><CircularProgress size={24} /><Typography>Loading knowledge base…</Typography></Stack>

  if (error) {
    const denied = error instanceof ApiError && error.status === 403
    const signedOut = error instanceof ApiError && error.status === 401
    return <Alert severity={denied ? 'warning' : 'error'}>
      {denied ? 'You do not have permission to preview this category.' : signedOut
        ? preview ? 'Your internal session is missing or has expired.'
          : 'Your Viewer session is missing or has expired. Open the Knowledge Base again from SwiftAssess.'
        : describeApiError(error).join(' ')}
    </Alert>
  }

  if (!portal) return <Alert severity='error'>This Viewer portal is unavailable.</Alert>

  const viewerRoot = categories.length === 1 ? categories[0] : null
  const hasRootArticles = viewerRoot && articles.some(article => article.categoryId === viewerRoot.categoryId)
  const sections = viewerRoot?.children.length
    ? [...(hasRootArticles ? [{ ...viewerRoot, children: [] }] : []), ...viewerRoot.children]
    : categories

  return <Stack spacing={6}>
    {preview && <Alert
      severity='info'
      action={<Button component={Link} href='/dashboard' color='inherit' size='small'>Return to dashboard</Button>}
    >
      Preview mode — Viewing as end user
    </Alert>}
    <Box sx={{ p: { xs: 5, md: 9 }, borderRadius: 2, textAlign: 'center', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
      <Stack spacing={4} sx={{ mx: 'auto', maxInlineSize: 800, alignItems: 'center' }}>
        <Box><Typography variant='h2' color='inherit'>{portal.name}</Typography><Typography color='inherit' sx={{ opacity: 0.84 }}>{portal.description ?? 'Find answers and product guidance.'}</Typography></Box>
        <CustomTextField value={query} onChange={event => setQuery(event.target.value)} placeholder='Search this knowledge base' sx={{ inlineSize: '100%', bgcolor: 'background.paper', borderRadius: 1 }} slotProps={{ input: { startAdornment: <InputAdornment position='start'><Search size={20} /></InputAdornment> } }} />
      </Stack>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 4 }}>
      {(query.trim() ? [{ categoryId: 'search', parentCategoryId: null, name: 'Search results', slug: 'search',
        description: null, sortOrder: 0, path: null, depth: 0, articleCount: articles.length, children: [] }] : sections).map(category => {
        const visibleCategoryIds = categoryIds(category)
        const rows = query.trim() ? articles : articles.filter(article => visibleCategoryIds.has(article.categoryId))
        return <Card key={category.categoryId} variant='outlined'><CardContent><Stack spacing={3}>
          <Stack direction='row' spacing={2}><BookOpen size={22} /><Box><Typography variant='h6'>{category.name}</Typography>{category.description && <Typography color='text.secondary'>{category.description}</Typography>}</Box></Stack>
          {rows.map(article => <Box key={article.articleId} component={Link} href={`${articleBasePath}/articles/${article.slug}`} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, color: 'text.primary', '&:hover': { color: 'primary.main' } }}><Typography>{article.title}</Typography><ChevronRight size={17} /></Box>)}
          {!rows.length && <Typography color='text.secondary'>No visible articles.</Typography>}
        </Stack></CardContent></Card>
      })}
    </Box>
  </Stack>
}
