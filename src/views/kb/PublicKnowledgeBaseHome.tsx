'use client'

import { useMemo, useState } from 'react'

import Link from 'next/link'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BookOpen, ChevronRight, Flame, Search } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import { kbArticles, kbCategories } from './kbMockData'

const PublicKnowledgeBaseHome = ({ lang }: { lang: string }) => {
  const [search, setSearch] = useState('')

  const publishedArticles = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/public/kb/articles should return published article summaries only.
    const needle = search.trim().toLowerCase()

    return kbArticles
      .filter(article => article.status === 'Published')
      .filter(article =>
        needle ? `${article.title} ${article.categoryPath}`.toLowerCase().includes(needle) : true
      )
  }, [search])

  const popularArticles = publishedArticles.toSorted((a, b) => b.views - a.views).slice(0, 6)

  return (
    <Stack spacing={8}>
      <Box
        className='rounded p-8 text-center md:p-12'
        sx={{
          backgroundColor: 'var(--mui-palette-primary-main)',
          color: 'var(--mui-palette-primary-contrastText)'
        }}
      >
        <Stack spacing={5} className='mx-auto max-is-[920px] items-center'>
          <Box>
            <Typography variant='h2' color='inherit'>
              Knowledge Base
            </Typography>
            <Typography color='inherit' sx={{ opacity: 0.82 }}>
              Find answers, implementation notes, and workflow guidance.
            </Typography>
          </Box>
          <CustomTextField
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder='How can we help?'
            className='is-full max-is-[720px] rounded bg-backgroundPaper'
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <Search size={22} />
                  </InputAdornment>
                )
              }
            }}
          />
          <Stack direction='row' spacing={2} className='flex-wrap justify-center'>
            {['Getting Started', 'Integrations', 'Compliance', 'Article Editor'].map(topic => (
              <Chip key={topic} label={topic} color='default' variant='outlined' className='bg-backgroundPaper' />
            ))}
          </Stack>
        </Stack>
      </Box>

      <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]'>
        <Stack spacing={6}>
          <Box>
            <Box className='mbs-1 mbe-4 flex items-center gap-2'>
              <Flame size={22} className='text-error' />
              <Typography variant='h5'>Popular Articles</Typography>
            </Box>
            <Box className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {popularArticles.map((article, index) => (
                <Box
                  key={article.id}
                  component={Link}
                  href={`/${lang}/kb/${article.slug}`}
                  className='flex items-center justify-between gap-3 rounded border p-4 hover:bg-actionHover'
                >
                  <Box className='min-is-0'>
                    <Typography color='text.primary' className='font-medium' noWrap>
                      {index + 1}. {article.title}
                    </Typography>
                    <Typography variant='body2' color='text.secondary' noWrap>
                      {article.categoryPath}
                    </Typography>
                  </Box>
                  <ChevronRight size={18} className='shrink-0 text-textSecondary' />
                </Box>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography variant='h5' className='mbe-4'>
              Browse Categories
            </Typography>
            <Box className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              {kbCategories.map(category => {
                const categoryArticles = publishedArticles.filter(article =>
                  article.categoryPath.toLowerCase().includes(category.name.toLowerCase())
                )

                return (
                  <Card key={category.id} variant='outlined'>
                    <CardContent>
                      <Stack spacing={3}>
                        <Box className='flex items-start gap-3'>
                          <BookOpen size={22} className='text-primary' />
                          <Box>
                            <Typography variant='h6'>{category.name}</Typography>
                            <Typography variant='body2' color='text.secondary'>
                              {category.subtitle}
                            </Typography>
                          </Box>
                        </Box>
                        <Divider />
                        <Stack spacing={2}>
                          {(categoryArticles.length ? categoryArticles : publishedArticles.slice(0, 2)).map(article => (
                            <Box
                              key={article.id}
                              component={Link}
                              href={`/${lang}/kb/${article.slug}`}
                              className='flex items-center justify-between gap-3 hover:text-primary'
                            >
                              <Typography className='min-is-0' noWrap>
                                {article.title}
                              </Typography>
                              <ChevronRight size={16} className='shrink-0' />
                            </Box>
                          ))}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                )
              })}
            </Box>
          </Box>
        </Stack>

        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={4}>
              <Typography variant='h6'>Featured Sections</Typography>
              {kbCategories.map(category => (
                <Box key={category.id} className='flex items-center justify-between gap-3'>
                  <Box>
                    <Typography color='text.primary' className='font-medium'>
                      {category.name}
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {category.articleCount} articles
                    </Typography>
                  </Box>
                  <ChevronRight size={18} className='text-textSecondary' />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  )
}

export default PublicKnowledgeBaseHome

