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
import ViewerLanguageSwitcher from './ViewerLanguageSwitcher'
import { getArticleLanguageTarget, getViewerRootPath } from './viewerLocaleRouting'
import { formatViewerMessage, getViewerMessages } from './viewerMessages'

type ViewerArticlePageProps = { activeLocale?: string } & (
  | { solutionSlug: string; articleSlug: string; preview?: never }
  | { solutionSlug?: never; articleSlug: string; preview: { categorySlug: string; accessToken: string } })

export default function ViewerArticlePage({ solutionSlug, articleSlug, preview, activeLocale }: ViewerArticlePageProps) {
  const [article, setArticle] = useState<ViewerArticle | null>(null)
  const [error, setError] = useState<unknown>()
  const messages = getViewerMessages(article?.activeLanguage.localeCode ?? activeLocale)

  useEffect(() => {
    const controller = new AbortController()
    const request = preview
      ? getViewerPreviewArticle(preview.categorySlug, articleSlug, preview.accessToken, activeLocale, controller.signal)
      : getViewerArticle(solutionSlug, articleSlug, activeLocale, controller.signal)
    request.then(setArticle).catch(value => {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value)
    })
    return () => controller.abort()
  }, [activeLocale, articleSlug, preview, solutionSlug])

  useEffect(() => {
    if (!article) return
    document.documentElement.lang = article.activeLanguage.localeCode
    document.documentElement.dir = article.activeLanguage.isRtl ? 'rtl' : 'ltr'
  }, [article])

  if (error) return <Alert severity={error instanceof ApiError && error.status === 403 ? 'warning' : 'error'}>{error instanceof ApiError && error.status === 403 ? messages.accessDenied : describeApiError(error).join(' ')}</Alert>
  if (!article) return <Stack direction='row' spacing={2}><CircularProgress size={24} /><Typography>{messages.loadingArticle}</Typography></Stack>

  const rootSlug = preview?.categorySlug ?? solutionSlug!
  const rootPath = getViewerRootPath(rootSlug, article.activeLanguage.localeCode, article.languages)

  return <Stack dir={article.activeLanguage.isRtl ? 'rtl' : 'ltr'} spacing={5}
    sx={{ maxInlineSize: 1040, mx: 'auto', textAlign: 'start' }}>
    <ViewerLanguageSwitcher
      activeLocale={article.activeLanguage.localeCode}
      languages={article.languages}
      getTarget={language => getArticleLanguageTarget(rootSlug, language, article.languages,
        article.availableTranslations).href}
    />
    {preview && <Alert severity='info'>{messages.previewMode}</Alert>}
    <Breadcrumbs><Link href={rootPath}>{messages.knowledgeBase}</Link><Typography color='text.secondary'>{article.categoryName}</Typography></Breadcrumbs>
    <Box><Typography variant='h3'>{article.title}</Typography><Typography color='text.secondary'>{formatViewerMessage(messages.updated, { date: formatDate(article.updatedAt, article.activeLanguage.localeCode) })}</Typography></Box>
    <Divider /><KnowledgeBaseViewer content={article.content} />
  </Stack>
}
