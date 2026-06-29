'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { BookOpen, CheckCircle2, Link2, Save } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import type { KnowledgeBaseEditorProps } from '@/features/editor/core/KnowledgeBaseEditor'
import { logDevError } from '@/features/editor/lib/utils/logDevError'

import { CategoryTree, PageHeader, StatusChip, articleStatusColor, roleLabels } from './KbShared'
import { currentEditorRole, kbArticles, kbCategories, sampleArticleContent } from './kbMockData'

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(() => import('@/features/editor/core/KnowledgeBaseEditor'), {
  ssr: false
})

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

const ArticleEditorShell = ({ lang }: { lang: string }) => {
  // TODO: connect to backend API.
  // GET /api/kb/articles/{articleId}/draft should return article metadata, draft lock state, rowVersion, and Tiptap JSON.
  const article = kbArticles[0]
  const [title, setTitle] = useState(article.title)
  const [slug, setSlug] = useState(article.slug)
  const [categoryId, setCategoryId] = useState(article.categoryId)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const primaryActionLabel = useMemo(
    () => (currentEditorRole === 'admin' || currentEditorRole === 'reviewer' ? 'Publish' : 'Submit for Review'),
    []
  )

  const handleContentChange = useCallback(async () => {
    setSaveStatus('saving')

    try {
      // TODO: connect to backend API.
      // PATCH /api/kb/article-drafts/{draftId}/autosave with title, slug, categoryId, Tiptap JSON, and rowVersion.
      setSaveStatus('saved')
    } catch (error) {
      setSaveStatus('failed')
      throw error
    }
  }, [])

  const handleAutosaveError = useCallback((error: unknown) => {
    setSaveStatus('failed')
    logDevError('Article editor autosave failed', error)
  }, [])

  const handleSaveDraft = () => {
    // TODO: connect to backend API.
    // PATCH /api/kb/article-drafts/{draftId} for explicit draft save.
    setSaveStatus('saved')
  }

  const handleWorkflowAction = () => {
    // TODO: connect to backend review/publishing API.
    // Authors submit drafts to /api/kb/reviews; reviewers/admins publish through /api/kb/articles/{articleId}/publish.
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Article Editor'
        subtitle={`Editing as ${roleLabels[currentEditorRole]}`}
        actions={
          <>
            <Button variant='outlined' startIcon={<Save size={18} />} onClick={handleSaveDraft}>
              Save Draft
            </Button>
            <Button variant='contained' startIcon={<CheckCircle2 size={18} />} onClick={handleWorkflowAction}>
              {primaryActionLabel}
            </Button>
          </>
        }
      />

      <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
        <Stack spacing={4}>
          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={4}>
                <Box className='flex items-center gap-2'>
                  <BookOpen size={18} className='text-primary' />
                  <Typography variant='h6'>Category</Typography>
                </Box>
                <CustomTextField
                  select
                  label='Primary Category'
                  value={categoryId}
                  onChange={event => setCategoryId(event.target.value)}
                  fullWidth
                >
                  {kbCategories.map(category => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                  {kbCategories.flatMap(category =>
                    category.children
                      ? category.children.map(child => (
                          <MenuItem key={child.id} value={child.id}>
                            {category.name} / {child.name}
                          </MenuItem>
                        ))
                      : []
                  )}
                </CustomTextField>
                <Divider />
                <CategoryTree categories={kbCategories} />
              </Stack>
            </CardContent>
          </Card>

          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant='h6'>Article Details</Typography>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Status
                  </Typography>
                  <StatusChip label={article.status} color={articleStatusColor[article.status]} />
                </Box>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Version
                  </Typography>
                  <Typography color='text.primary'>{article.version}</Typography>
                </Box>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Autosave
                  </Typography>
                  <Typography color={saveStatus === 'failed' ? 'error.main' : 'text.primary'}>
                    {saveStatus === 'idle' && 'Ready'}
                    {saveStatus === 'saving' && 'Saving'}
                    {saveStatus === 'saved' && 'Saved'}
                    {saveStatus === 'failed' && 'Failed'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={5}>
              <Breadcrumbs aria-label='Editor breadcrumbs'>
                <Link href={`/${lang}/articles`}>Articles</Link>
                <Typography color='text.secondary'>{article.categoryPath}</Typography>
              </Breadcrumbs>

              <Box className='grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]'>
                <CustomTextField
                  label='Article Title'
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  fullWidth
                />
                <Stack spacing={3}>
                  <CustomTextField
                    label='Slug'
                    value={slug}
                    onChange={event => setSlug(event.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position='start'>
                            <Link2 size={16} />
                          </InputAdornment>
                        )
                      }
                    }}
                  />
                  <Chip size='small' label='On Draft Revision' color='warning' variant='tonal' />
                </Stack>
              </Box>

              <EditorCanvas
                content={sampleArticleContent}
                onChange={handleContentChange}
                onChangeError={handleAutosaveError}
              />
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  )
}

export default ArticleEditorShell
