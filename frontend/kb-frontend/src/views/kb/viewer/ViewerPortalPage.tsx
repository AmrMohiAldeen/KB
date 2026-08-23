'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowRight, ChevronRight, FileText, Search } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import { ApiError, describeApiError } from '@/lib/api/http'
import { renderCategoryViewerIcon } from '@/views/kb/categories/categoryViewerIcons'
import {
  getViewerArticles,
  getViewerCategories,
  getViewerCategoryImage,
  getViewerPortal,
  getViewerPreviewArticles,
  getViewerPreviewCategories,
  getViewerPreviewCategoryImage,
  getViewerPreviewPortal,
  searchViewerArticles,
  searchViewerPreviewArticles,
  type ViewerArticleSummary,
  type ViewerCategoryNode,
  type ViewerPortal
} from '@/lib/api/viewerKnowledgeBaseApi'

type ViewerPortalPageProps =
  | { solutionSlug: string; categorySlug?: string; preview?: never }
  | { solutionSlug?: never; categorySlug?: string; preview: { categorySlug: string; accessToken: string } }

const flattenCategories = (categories: ViewerCategoryNode[]): ViewerCategoryNode[] =>
  categories.flatMap(category => [category, ...flattenCategories(category.children)])

const findTrail = (category: ViewerCategoryNode, categoryId: string): ViewerCategoryNode[] | null => {
  if (category.categoryId === categoryId) return [category]
  for (const child of category.children) {
    const trail = findTrail(child, categoryId)
    if (trail) return [category, ...trail]
  }
  return null
}

const CategoryArtwork = ({ category, solutionSlug, preview }: {
  category: ViewerCategoryNode
  solutionSlug?: string
  preview?: { categorySlug: string; accessToken: string }
}) => {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!category.hasViewerImage) return
    const controller = new AbortController()
    let objectUrl = ''
    const request = preview
      ? getViewerPreviewCategoryImage(preview.categorySlug, category.categoryId, preview.accessToken,
          controller.signal)
      : getViewerCategoryImage(solutionSlug!, category.categoryId, controller.signal)
    request.then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [category.categoryId, category.hasViewerImage, preview, solutionSlug])

  if (category.hasViewerImage && !source && !failed)
    return <Skeleton variant='rounded' sx={{ inlineSize: 72, blockSize: 72, borderRadius: 2 }} />

  if (source && !failed) return <Box
    component='img'
    src={source}
    alt=''
    loading='lazy'
    onError={() => setFailed(true)}
    sx={{ inlineSize: 84, blockSize: 84, borderRadius: 2, objectFit: 'cover' }}
  />

  return <Box sx={{
    inlineSize: 72,
    blockSize: 72,
    borderRadius: 2,
    display: 'grid',
    placeItems: 'center',
    bgcolor: 'action.hover',
    color: 'primary.main'
  }}>{renderCategoryViewerIcon(category.viewerIcon, { size: 34, strokeWidth: 1.8 })}</Box>
}

const ViewerLoading = () => <Stack spacing={5} aria-label='Loading knowledge base'>
  <Stack spacing={2} sx={{ alignItems: 'center', py: 5 }}>
    <Skeleton width='48%' height={54} />
    <Skeleton width='68%' height={58} sx={{ borderRadius: 2 }} />
  </Stack>
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
    {[1, 2, 3, 4, 5, 6].map(item => <Skeleton key={item} variant='rounded' height={210} sx={{ borderRadius: 3 }} />)}
  </Box>
</Stack>

export default function ViewerPortalPage({ solutionSlug, categorySlug, preview }: ViewerPortalPageProps) {
  const [portal, setPortal] = useState<ViewerPortal | null>(null)
  const [categories, setCategories] = useState<ViewerCategoryNode[]>([])
  const [articles, setArticles] = useState<ViewerArticleSummary[]>([])
  const [searchResults, setSearchResults] = useState<ViewerArticleSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<unknown>()
  const [searchError, setSearchError] = useState<unknown>()
  const rootSlug = preview?.categorySlug ?? solutionSlug!
  const rootPath = `/${rootSlug}`

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setLoading(true)
      setError(undefined)
    })
    const requests = preview
      ? [
          getViewerPreviewPortal(preview.categorySlug, preview.accessToken, controller.signal),
          getViewerPreviewCategories(preview.categorySlug, preview.accessToken, controller.signal),
          getViewerPreviewArticles(preview.categorySlug, preview.accessToken, controller.signal)
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
  }, [preview, solutionSlug])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const request = preview
        ? searchViewerPreviewArticles(preview.categorySlug, trimmed, preview.accessToken, controller.signal)
        : searchViewerArticles(solutionSlug!, trimmed, controller.signal)
      request.then(setSearchResults).catch(value => {
        if (!(value instanceof DOMException && value.name === 'AbortError')) setSearchError(value)
      }).finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [preview, query, solutionSlug])

  const allCategories = useMemo(() => flattenCategories(categories), [categories])
  const viewerRoot = categories.length === 1 ? categories[0] : null
  const currentCategory = categorySlug
    ? allCategories.find(category => category.slug === categorySlug)
    : viewerRoot
  const trail = viewerRoot && currentCategory ? findTrail(viewerRoot, currentCategory.categoryId) ?? [] : []

  if (loading) return <ViewerLoading />
  if (error) {
    const denied = error instanceof ApiError && error.status === 403
    const signedOut = error instanceof ApiError && error.status === 401
    return <Alert severity={denied ? 'warning' : 'error'} action={<Button onClick={() => window.location.reload()}>Retry</Button>}>
      {denied ? 'You do not have permission to preview this category.' : signedOut
        ? preview ? 'Your internal session is missing or has expired.'
          : 'Your Viewer session is missing or has expired. Open the Knowledge Base again from SwiftAssess.'
        : describeApiError(error).join(' ')}
    </Alert>
  }
  if (!portal || !viewerRoot) return <Alert severity='error'>This Viewer portal is unavailable.</Alert>
  if (!currentCategory) return <Alert severity='warning' action={<Button component={Link} href={rootPath}>Return home</Button>}>
    This category is unavailable in the current knowledge base.
  </Alert>

  const directArticles = articles.filter(article => article.categoryId === currentCategory.categoryId)
  const showingSearch = Boolean(query.trim())
  const resultRows = searchResults ?? []
  const appearance = portal.appearance ?? {
    primaryColor: '#1976D2', pageBackgroundColor: '#F8FAFC', categoryCardBackgroundColor: '#FFFFFF', textColor: '#1E293B'
  }

  return <Stack spacing={{ xs: 4, md: 6 }} sx={{
    maxInlineSize: 1240,
    mx: 'auto',
    p: { xs: 2, md: 4 },
    borderRadius: 3,
    bgcolor: appearance.pageBackgroundColor,
    color: appearance.textColor
  }}>
    {preview && <Alert
      severity='info'
      action={<Button component={Link} href='/dashboard' color='inherit' size='small'>Return to dashboard</Button>}
    >
      Preview mode — Viewing as end user
    </Alert>}

    {trail.length > 1 && <Breadcrumbs aria-label='Category breadcrumb'>
      {trail.map((category, index) => index === trail.length - 1
        ? <Typography key={category.categoryId} color='text.primary'>{category.name}</Typography>
        : <Link key={category.categoryId} href={index === 0 ? rootPath : `${rootPath}/categories/${category.slug}`}>
            {category.name}
          </Link>)}
    </Breadcrumbs>}

    <Box component='header' sx={{ textAlign: 'center', pt: { xs: 2, md: 5 } }}>
      <Stack spacing={3} sx={{ alignItems: 'center' }}>
        <Box>
          <Typography component='h1' variant='h2' sx={{ color: appearance.textColor, fontSize: { xs: '2rem', md: '2.75rem' }, letterSpacing: '-0.03em' }}>
            {currentCategory.name}
          </Typography>
          <Typography color='text.secondary' sx={{ mt: 1, fontSize: { xs: '1rem', md: '1.125rem' } }}>
            {currentCategory.description ?? portal.description ?? 'Find answers and product guidance.'}
          </Typography>
        </Box>
        <CustomTextField
          value={query}
          onChange={event => {
            const value = event.target.value
            setQuery(value)
            setSearchError(undefined)
            setSearchResults(null)
            setSearching(Boolean(value.trim()))
          }}
          placeholder={`Search ${portal.name}`}
          aria-label={`Search ${portal.name}`}
          sx={{
            inlineSize: '100%',
            maxInlineSize: 760,
            '& .MuiOutlinedInput-root': {
              minBlockSize: 58,
              borderRadius: 3,
              bgcolor: 'background.paper',
              boxShadow: theme => theme.shadows[2],
              '&:hover': { boxShadow: theme => theme.shadows[3] },
              '&.Mui-focused': { boxShadow: theme => `0 0 0 3px ${theme.palette.primary.main}22` }
            }
          }}
          slotProps={{ input: {
            startAdornment: <InputAdornment position='start'><Search size={21} /></InputAdornment>,
            endAdornment: searching ? <InputAdornment position='end'><CircularProgress size={18} /></InputAdornment> : undefined
          } }}
        />
      </Stack>
    </Box>

    {searchError ? <Alert severity='error'>{describeApiError(searchError).join(' ')}</Alert> : null}

    {showingSearch ? <Box component='section' aria-labelledby='search-results-title'>
      <Typography id='search-results-title' variant='h5' sx={{ mb: 2 }}>Search results</Typography>
      {!searching && !resultRows.length ? <Box sx={{ py: 7, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 3 }}>
        <Search size={34} /><Typography variant='h6' sx={{ mt: 2 }}>No matching articles</Typography>
        <Typography color='text.secondary'>Try a different word or a broader phrase.</Typography>
      </Box> : <Stack spacing={1.5}>
        {resultRows.map(article => <Card
          key={article.articleId}
          component={Link}
          href={`${rootPath}/articles/${article.slug}`}
          variant='outlined'
          sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2, color: 'text.primary', textDecoration: 'none',
            transition: 'border-color 160ms ease, transform 160ms ease', '&:hover': { borderColor: 'primary.main', transform: 'translateY(-1px)' } }}
        >
          <FileText size={20} /><Box sx={{ flex: 1 }}><Typography sx={{ fontWeight: 600 }}>{article.title}</Typography>
            <Typography variant='body2' color='text.secondary'>{article.categoryName}</Typography></Box><ChevronRight size={18} />
        </Card>)}
      </Stack>}
    </Box> : <>
      {currentCategory.children.length > 0 && <Box component='section' aria-labelledby='categories-title'>
        <Typography id='categories-title' variant='overline' color='text.secondary' sx={{ fontWeight: 700, letterSpacing: '0.08em' }}>
          Browse categories
        </Typography>
        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 3 }}>
          {currentCategory.children.map(category => <Card
            key={category.categoryId}
            component={Link}
            href={`${rootPath}/categories/${category.slug}`}
            variant='outlined'
            sx={{
              minBlockSize: 210,
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              color: appearance.textColor,
              bgcolor: appearance.categoryCardBackgroundColor,
              textDecoration: 'none',
              borderRadius: 3,
              transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
              '&:hover': { borderColor: appearance.primaryColor, boxShadow: 4, transform: 'translateY(-3px)' },
              '&:focus-visible': { outline: `3px solid ${appearance.primaryColor}`, outlineOffset: 3 }
            }}
          >
            <CategoryArtwork category={category} solutionSlug={solutionSlug} preview={preview} />
            <Box sx={{ mt: 3, flex: 1 }}>
              <Typography variant='h6'>{category.name}</Typography>
              {category.description && <Typography variant='body2' color='text.secondary' sx={{ mt: 0.75 }}>
                {category.description}
              </Typography>}
            </Box>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mt: 2, color: appearance.primaryColor }}>
              <Typography variant='body2' sx={{ fontWeight: 600 }}>Explore</Typography><ArrowRight size={16} />
            </Stack>
          </Card>)}
        </Box>
      </Box>}

      {directArticles.length > 0 && <Box component='section' aria-labelledby='articles-title'>
        <Typography id='articles-title' variant='h5' sx={{ mb: 2 }}>Articles</Typography>
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: appearance.categoryCardBackgroundColor, overflow: 'hidden' }}>
          {directArticles.map((article, index) => <Box
            key={article.articleId}
            component={Link}
            href={`${rootPath}/articles/${article.slug}`}
            sx={{
              px: { xs: 2.5, md: 3 }, py: 2.25, display: 'flex', alignItems: 'center', gap: 2,
              color: appearance.textColor, textDecoration: 'none', borderBlockStart: index ? 1 : 0, borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover', color: appearance.primaryColor },
              '&:focus-visible': { outline: `2px solid ${appearance.primaryColor}`, outlineOffset: -2 }
            }}
          ><FileText size={19} /><Typography sx={{ flex: 1, fontWeight: 500 }}>{article.title}</Typography><ChevronRight size={18} /></Box>)}
        </Box>
      </Box>}

      {!currentCategory.children.length && !directArticles.length && <Box sx={{ py: 8, textAlign: 'center', border: 1, borderColor: 'divider', borderRadius: 3 }}>
        <FileText size={36} /><Typography variant='h6' sx={{ mt: 2 }}>Nothing published here yet</Typography>
        <Typography color='text.secondary'>Articles and subcategories will appear here when available.</Typography>
      </Box>}
    </>}
  </Stack>
}
