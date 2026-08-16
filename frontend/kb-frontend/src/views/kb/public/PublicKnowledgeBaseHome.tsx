'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { BookOpen, ChevronRight, Flame, Search } from 'lucide-react'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import EmptyState from '../shared/components/EmptyState'

// Data Imports
import { getPublicArticles, getPublicCategories } from '@/lib/api/publicKnowledgeBaseApi'
import type { KbCategoryNode } from '../types/categories'
import type { PublicArticleSummary } from '../types/public'

// Util Imports
import { getCategoryArticles, getPopularPublicArticles, getVisiblePublicArticles } from './utils/publicArticles'

const PublicKnowledgeBaseHome = ({ lang }: { lang: string }) => {
  // States
  const [search, setSearch] = useState('')
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [articles, setArticles] = useState<PublicArticleSummary[]>([])

  // Vars
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getPublicCategories(controller.signal), getPublicArticles(undefined, controller.signal)])
      .then(([categoryRows, articleRows]) => {
        const mapCategory = (category: typeof categoryRows[number]): KbCategoryNode => ({
          id: category.categoryId,
          parentId: category.parentCategoryId,
          name: category.name,
          slug: category.slug,
          description: category.description ?? '',
          sortOrder: category.sortOrder,
          path: category.path,
          depth: category.depth,
          articleCount: category.articleCount,
          status: 'Active',
          visibility: 'Public',
          children: category.children.map(mapCategory)
        })
        setCategories(categoryRows.map(mapCategory))
        setArticles(articleRows.map(article => ({
          id: article.articleId,
          title: article.title,
          slug: article.slug,
          categoryPath: article.categoryPath,
          views: 0
        })))
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCategories([])
          setArticles([])
        }
      })
    return () => controller.abort()
  }, [])

  // Hooks
  const publishedArticles = useMemo(() => {
    return getVisiblePublicArticles(articles, search)
  }, [articles, search])

  const popularArticles = useMemo(() => getPopularPublicArticles(publishedArticles), [publishedArticles])

  // Render
  return (
    <KbPageShell>
      <Box
        sx={{
          p: { xs: 6, md: 10 },
          borderRadius: 1,
          textAlign: 'center',
          backgroundColor: 'var(--mui-palette-primary-main)',
          color: 'var(--mui-palette-primary-contrastText)'
        }}
      >
        <Stack spacing={5} sx={{ mx: 'auto', maxInlineSize: 920, alignItems: 'center' }}>
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
            sx={{
              inlineSize: '100%',
              maxInlineSize: 720,
              bgcolor: 'background.paper',
              borderRadius: 1
            }}
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
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 340px' }, gap: 6 }}>
        <Stack spacing={6}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
              <Flame size={22} color='var(--mui-palette-error-main)' />
              <Typography variant='h5'>Popular Articles</Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
              {popularArticles.map((article, index) => (
                <Box
                  key={article.id}
                  component={Link}
                  href={`/${lang}/kb/${article.slug}`}
                  sx={theme => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 3,
                    p: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  })}
                >
                  <Box sx={{ minInlineSize: 0 }}>
                    <Typography color='text.primary' sx={{ fontWeight: 500 }} noWrap>
                      {index + 1}. {article.title}
                    </Typography>
                    <Typography variant='body2' color='text.secondary' noWrap>
                      {article.categoryPath}
                    </Typography>
                  </Box>
                  <ChevronRight size={18} color='var(--mui-palette-text-secondary)' />
                </Box>
              ))}
            </Box>
            {!popularArticles.length && (
              <EmptyState
                title='No popular articles loaded'
                body='Published article summaries will appear here after the public KB API is connected.'
              />
            )}
          </Box>

          <Box>
            <Typography variant='h5' sx={{ mb: 4 }}>
              Browse Categories
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 4 }}>
              {categories.map(category => {
                const categoryArticles = getCategoryArticles(publishedArticles, category)

                return (
                  <Card key={category.id} variant='outlined'>
                    <CardContent>
                      <Stack spacing={3}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 3 }}>
                          <BookOpen size={22} color='var(--mui-palette-primary-main)' />
                          <Box>
                            <Typography variant='h6'>{category.name}</Typography>
                            <Typography variant='body2' color='text.secondary'>
                              {category.description}
                            </Typography>
                          </Box>
                        </Box>
                        <Divider />
                        <Stack spacing={2}>
                          {categoryArticles.map(article => (
                            <Box
                              key={article.id}
                              component={Link}
                              href={`/${lang}/kb/${article.slug}`}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 3,
                                color: 'text.primary',
                                '&:hover': {
                                  color: 'primary.main'
                                }
                              }}
                            >
                              <Typography sx={{ minInlineSize: 0 }} noWrap>
                                {article.title}
                              </Typography>
                              <ChevronRight size={16} />
                            </Box>
                          ))}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                )
              })}
            </Box>
            {!categories.length && (
              <EmptyState
                title='No categories loaded'
                body='Public category sections will appear here after published categories are loaded.'
              />
            )}
          </Box>
        </Stack>

        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={4}>
              <Typography variant='h6'>Featured Sections</Typography>
              {categories.map(category => (
                <Box key={category.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
                  <Box>
                    <Typography color='text.primary' sx={{ fontWeight: 500 }}>
                      {category.name}
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {category.articleCount} articles
                    </Typography>
                  </Box>
                  <ChevronRight size={18} color='var(--mui-palette-text-secondary)' />
                </Box>
              ))}
              {!categories.length && (
                <Typography color='text.secondary'>Sections will appear after the public KB API is connected.</Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </KbPageShell>
  )
}

export default PublicKnowledgeBaseHome
