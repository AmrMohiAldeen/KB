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
import type { ArticleDetailsResponse } from '@/types/apps/articleTypes'
import type { PublishedArticleVersionResponse } from '@/types/apps/articleLifecycleTypes'
import { getArticleBySlug } from '@/lib/api/articlesApi'
import { getPublishedArticleVersion, describeLifecycleError } from '@/lib/api/articleLifecycleApi'
import { ApiError } from '@/lib/api/http'
import ArticleLifecyclePanel from '@/features/lifecycle/ArticleLifecyclePanel'
import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'
import { KbPageShell } from '@/views/shared'
import EmptyState from '../shared/components/EmptyState'
import StatusChip from '../shared/components/StatusChip'
import { articleStatusColor, articleStatusLabel } from '../config/articles'
import { formatDate } from '../shared/utils/formatDate'

type PublicArticleViewerPageProps = {
  lang: string
  slug: string
  accessToken: string
}

export default function PublicArticleViewerPage({ lang, slug, accessToken }: PublicArticleViewerPageProps) {
  const [article, setArticle] = useState<ArticleDetailsResponse | null>(null)
  const [publishedVersion, setPublishedVersion] = useState<PublishedArticleVersionResponse | null>(null)
  const [loading, setLoading] = useState(Boolean(accessToken))
  const [messages, setMessages] = useState<string[]>(accessToken ? [] : ['Authentication is required.'])
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setLoading(true)
    setMessages([])
    setRefreshKey(value => value + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    if (!accessToken) return () => controller.abort()

    const load = async () => {
      try {
        const nextArticle = await getArticleBySlug(slug, accessToken, controller.signal)
        let nextPublishedVersion: PublishedArticleVersionResponse | null = null
        try {
          nextPublishedVersion = await getPublishedArticleVersion(
            nextArticle.articleId,
            accessToken,
            controller.signal
          )
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error
        }
        if (controller.signal.aborted) return
        setArticle(nextArticle)
        setPublishedVersion(nextPublishedVersion)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setArticle(null)
        setPublishedVersion(null)
        setMessages(describeLifecycleError(error))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()

    return () => controller.abort()
  }, [accessToken, refreshKey, slug])

  return (
    <KbPageShell>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: '260px minmax(0, 1fr)' },
          gap: 6,
          alignItems: 'start'
        }}
      >
        <Card variant='outlined' sx={{ position: { xl: 'sticky' }, top: { xl: 88 } }}>
          <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
            <Stack spacing={4}>
              <Box
                component={Link}
                href={`/${lang}/dashboard`}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'primary.main', fontWeight: 500 }}
              >
                <ArrowLeft size={18} />
                <Typography color='inherit'>Dashboard</Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant='overline' color='text.secondary'>Current workflow</Typography>
                <Box sx={{ mt: 1.5 }}>
                  {article ? (
                    <StatusChip
                      label={articleStatusLabel[article.status]}
                      color={articleStatusColor[article.status]}
                    />
                  ) : <Typography variant='body2' color='text.secondary'>Unavailable</Typography>}
                </Box>
              </Box>
              <Button variant='outlined' startIcon={<RefreshCw size={16} />} disabled={loading} onClick={refresh}>
                Reload
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Stack spacing={4}>
          {messages.map(message => <Alert key={message} severity='error'>{message}</Alert>)}
          <Card variant='outlined' sx={{ overflow: 'hidden' }}>
            <CardContent sx={{ p: { xs: 4, md: 6 } }}>
              <Stack spacing={5}>
                <Breadcrumbs aria-label='Article breadcrumbs'>
                  <Link href={`/${lang}/dashboard`}>Dashboard</Link>
                  <Typography color='text.secondary'>{slug}</Typography>
                </Breadcrumbs>

                {loading ? (
                  <Stack direction='row' spacing={2} sx={{ alignItems: 'center' }}>
                    <CircularProgress size={22} />
                    <Typography>Loading the published article…</Typography>
                  </Stack>
                ) : article ? (
                  <>
                    <Box>
                      <Stack direction='row' spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
                        {publishedVersion && (
                          <StatusChip label={`Published v${publishedVersion.versionNumber}`} color='success' />
                        )}
                        <StatusChip
                          label={`Workflow: ${articleStatusLabel[article.status]}`}
                          color={articleStatusColor[article.status]}
                        />
                        {publishedVersion && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                            <Clock size={16} />
                            <Typography variant='body2'>{formatDate(publishedVersion.createdAt)}</Typography>
                          </Box>
                        )}
                      </Stack>
                      <Typography variant='h3' color='text.primary'>{article.title}</Typography>
                      <Typography color='text.secondary'>{article.category?.path ?? article.category?.name}</Typography>
                    </Box>

                    <Divider />

                    {publishedVersion ? (
                      <>
                        {article.status !== 'Published' && (
                          <Alert severity='info'>
                            You are viewing immutable published version {publishedVersion.versionNumber}. The newer
                            {' '}{articleStatusLabel[article.status].toLowerCase()} draft does not replace reader content until it is approved and published.
                          </Alert>
                        )}
                        <KnowledgeBaseViewer content={publishedVersion.content} />
                      </>
                    ) : (
                      <EmptyState
                        title='No published version'
                        body='This article has not been published yet. Its draft remains available through the editor and review workflow.'
                      />
                    )}
                  </>
                ) : (
                  <EmptyState title='Article not available' body='Reload the page or return to the dashboard.' />
                )}
              </Stack>
            </CardContent>
          </Card>

          {article && (
            <ArticleLifecyclePanel
              articleId={article.articleId}
              accessToken={accessToken}
              onChanged={refresh}
              onArchived={() => setArticle(null)}
            />
          )}
        </Stack>
      </Box>
    </KbPageShell>
  )
}
