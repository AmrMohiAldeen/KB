'use client'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowLeft, Clock, Eye } from 'lucide-react'

import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'

import { CategoryTree, EmptyState, KbPageShell, StatusChip, articleStatusColor, formatDate } from './KbShared'
import { emptyCategories } from './kbMockData'
import type { PublicArticleDetails } from './kbMockData'

const PublicArticleViewerPage = ({ lang, slug }: { lang: string; slug: string }) => {
  // TODO: connect to backend API.
  // GET /api/public/kb/articles/{slug} should return published article metadata and Tiptap JSON content.
  const article = null as PublicArticleDetails | null
  const categories = emptyCategories

  return (
    <KbPageShell>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr)' }, gap: 6, alignItems: 'start' }}>
      <Card variant='outlined' sx={{ position: { xl: 'sticky' }, top: { xl: 88 } }}>
        <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
          <Stack spacing={4}>
            <Box
              component={Link}
              href={`/${lang}/kb`}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                color: 'primary.main',
                fontWeight: 500
              }}
            >
              <ArrowLeft size={18} />
              <Typography color='inherit'>Knowledge Base</Typography>
            </Box>
            <Divider />
            <Box>
              <Typography variant='overline' color='text.secondary'>
                Categories
              </Typography>
              <Box sx={{ mt: 2 }}>
                <CategoryTree categories={categories} compact />
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card variant='outlined' sx={{ overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 4, md: 6 } }}>
          <Stack spacing={5}>
            <Breadcrumbs aria-label='Article breadcrumbs'>
              <Link href={`/${lang}/kb`}>Home</Link>
              <Typography color='text.secondary'>{slug}</Typography>
            </Breadcrumbs>

            {article ? (
              <>
                <Box>
                  <Stack direction='row' spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
                    <StatusChip label='Published' color={articleStatusColor.Published} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <Clock size={16} />
                      <Typography variant='body2'>{formatDate(article.updatedAt)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <Eye size={16} />
                      <Typography variant='body2'>{article.views.toLocaleString()} views</Typography>
                    </Box>
                  </Stack>
                  <Typography variant='h3' color='text.primary'>
                    {article.title}
                  </Typography>
                  <Typography color='text.secondary'>{article.categoryPath}</Typography>
                </Box>

                <Divider />

                <KnowledgeBaseViewer content={article.content} />
              </>
            ) : (
              <EmptyState
                title='Article not loaded'
                body='Published article content will render here after the public article API is connected.'
              />
            )}
          </Stack>
        </CardContent>
      </Card>
      </Box>
    </KbPageShell>
  )
}

export default PublicArticleViewerPage
