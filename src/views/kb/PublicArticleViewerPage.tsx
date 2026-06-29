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

import { CategoryTree, StatusChip, articleStatusColor, formatDate } from './KbShared'
import { kbArticles, kbCategories, sampleArticleContent } from './kbMockData'

const PublicArticleViewerPage = ({ lang, slug }: { lang: string; slug: string }) => {
  // TODO: connect to backend API.
  // GET /api/public/kb/articles/{slug} should return published article metadata and Tiptap JSON content.
  const article =
    kbArticles.find(item => item.slug === slug && item.status === 'Published') ??
    kbArticles.find(item => item.status === 'Published')!

  return (
    <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
      <Card variant='outlined' className='self-start'>
        <CardContent>
          <Stack spacing={4}>
            <Box component={Link} href={`/${lang}/kb`} className='flex items-center gap-2 text-primary'>
              <ArrowLeft size={18} />
              <Typography color='inherit'>Knowledge Base</Typography>
            </Box>
            <Divider />
            <Box>
              <Typography variant='overline' color='text.secondary'>
                Categories
              </Typography>
              <CategoryTree categories={kbCategories} />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card variant='outlined'>
        <CardContent>
          <Stack spacing={5}>
            <Breadcrumbs aria-label='Article breadcrumbs'>
              <Link href={`/${lang}/kb`}>Home</Link>
              <Typography color='text.secondary'>{article.categoryPath}</Typography>
            </Breadcrumbs>

            <Box>
              <Stack direction='row' spacing={2} className='mbe-3 flex-wrap items-center'>
                <StatusChip label='Published' color={articleStatusColor.Published} />
                <Box className='flex items-center gap-1 text-textSecondary'>
                  <Clock size={16} />
                  <Typography variant='body2'>{formatDate(article.updatedAt)}</Typography>
                </Box>
                <Box className='flex items-center gap-1 text-textSecondary'>
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

            <KnowledgeBaseViewer content={sampleArticleContent} />
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}

export default PublicArticleViewerPage
