'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ClipboardList, FileCheck2, FileClock, RefreshCw, Send } from 'lucide-react'
import type { ArticleListItemResponse, ArticleStatus } from '@/types/apps/articleTypes'
import { articleAuthor, historicalHelpJuiceAuthor } from '@/lib/articles/articleAuthor'
import { getArticles } from '@/lib/api/articlesApi'
import { describeLifecycleError } from '@/lib/api/articleLifecycleApi'
import ArticleLifecyclePanel from '@/features/lifecycle/ArticleLifecyclePanel'
import { KbPageShell } from '@/views/shared'
import KbKanbanBoard from '@/views/shared/kanban/KbKanbanBoard'
import KbKanbanColumn, { KbKanbanColumnEmptyState } from '@/views/shared/kanban/KbKanbanColumn'
import StatusChip from '../shared/components/StatusChip'
import PageHeader from '../shared/components/PageHeader'
import { articleStatusColor, articleStatusLabel } from '../config/articles'
import { formatDate } from '../shared/utils/formatDate'

type ReviewPlannerBoardProps = {
  lang: string
  accessToken: string
}

const columns: Array<{
  id: string
  title: string
  statuses: ArticleStatus[]
  icon: React.ReactNode
  tone: 'info' | 'secondary' | 'warning' | 'success'
}> = [
  { id: 'drafts', title: 'Drafts & changes', statuses: ['Draft', 'ChangesRequested'], icon: <FileClock />, tone: 'secondary' },
  { id: 'submitted', title: 'Submitted', statuses: ['SubmittedForReview'], icon: <Send />, tone: 'info' },
  { id: 'review', title: 'Review & approval', statuses: ['InReview', 'Approved'], icon: <ClipboardList />, tone: 'warning' },
  { id: 'published', title: 'Published', statuses: ['Published'], icon: <FileCheck2 />, tone: 'success' }
]

const authorLabel = (article: ArticleListItemResponse) => {
  const historical = historicalHelpJuiceAuthor(article)
  return historical ? `Original author: ${historical}` : articleAuthor(article)
}

export default function ReviewPlannerBoard({ accessToken }: ReviewPlannerBoardProps) {
  const [articles, setArticles] = useState<ArticleListItemResponse[]>([])
  const [selectedId, setSelectedId] = useState('')
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

    getArticles({
      page: 1,
      pageSize: 100,
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    }, accessToken, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setArticles(result.items)
      setSelectedId(current => current && result.items.some(article => article.articleId === current)
        ? current
        : result.items[0]?.articleId ?? '')
      if (result.totalCount > result.items.length)
        setMessages(['Showing the 100 most recently updated articles. Refine the workflow through the dashboard if needed.'])
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setArticles([])
      setMessages(describeLifecycleError(error))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [accessToken, refreshKey])

  const grouped = useMemo(() => new Map(columns.map(column => [
    column.id,
    articles.filter(article => column.statuses.includes(article.status))
  ])), [articles])

  return (
    <KbPageShell maxWidth='100%'>
      <PageHeader
        title='Article review'
        subtitle='Review live article workflow state and perform only backend-authorized transitions.'
        actions={
          <Button variant='outlined' startIcon={<RefreshCw size={17} />} disabled={loading} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {messages.map(message => <Alert key={message} severity='info'>{message}</Alert>)}
      {loading ? (
        <Stack direction='row' spacing={2} sx={{ alignItems: 'center', p: 4 }}>
          <CircularProgress size={22} />
          <Typography>Loading review workflow…</Typography>
        </Stack>
      ) : (
        <KbKanbanBoard>
          {columns.map(column => {
            const items = grouped.get(column.id) ?? []
            return (
              <KbKanbanColumn
                key={column.id}
                title={column.title}
                count={items.length}
                icon={column.icon}
                tone={column.tone}
              >
                {items.map(article => (
                  <Card
                    key={article.articleId}
                    variant='outlined'
                    sx={{
                      boxShadow: 'none',
                      borderColor: selectedId === article.articleId ? 'primary.main' : undefined
                    }}
                  >
                    <CardActionArea onClick={() => setSelectedId(article.articleId)}>
                      <CardContent>
                        <Stack spacing={2}>
                          <Typography color='text.primary' sx={{ fontWeight: 700 }}>
                            {article.title}
                          </Typography>
                          <Typography variant='body2' color='text.secondary'>
                            {authorLabel(article)} · updated {formatDate(article.updatedAt)}
                          </Typography>
                          <Box>
                            <StatusChip
                              label={articleStatusLabel[article.status]}
                              color={articleStatusColor[article.status]}
                            />
                            {article.visibility && <StatusChip
                              label={article.visibility}
                              color={article.visibility === 'Internal' ? 'warning' : 'success'}
                            />}
                          </Box>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
                {!items.length && <KbKanbanColumnEmptyState />}
              </KbKanbanColumn>
            )
          })}
        </KbKanbanBoard>
      )}

      {selectedId && (
        <ArticleLifecyclePanel
          key={selectedId}
          articleId={selectedId}
          accessToken={accessToken}
          onChanged={refresh}
          onArchived={refresh}
        />
      )}
    </KbPageShell>
  )
}
