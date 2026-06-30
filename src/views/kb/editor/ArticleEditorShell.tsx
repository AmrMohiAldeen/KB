'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

// Next Imports
import dynamic from 'next/dynamic'
import Link from 'next/link'

// MUI Imports
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

// Third-party Imports
import { BookOpen, CheckCircle2, Link2, Save } from 'lucide-react'

// Type Imports
import type { KnowledgeBaseEditorProps } from '@/features/editor/core/KnowledgeBaseEditor'
import type { KbUserRole } from '@/types/apps/userTypes'
import type { EditorArticleDraft } from '../types/editor'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import CategoryTree from '../shared/components/CategoryTree'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'

// Config Imports
import { articleStatusColor } from '../config/articles'
import { roleLabels } from '../config/roles'

// Data Imports
import { emptyCategories } from '../data/categories'

// Util Imports
import { logDevError } from '@/features/editor/lib/utils/logDevError'

const EditorCanvas = dynamic<KnowledgeBaseEditorProps>(() => import('@/features/editor/core/KnowledgeBaseEditor'), {
  ssr: false
})

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

const ArticleEditorShell = ({ lang }: { lang: string }) => {
  // Vars
  // TODO: connect to backend API.
  // GET /api/kb/articles/{articleId}/draft should return article metadata, draft lock state, rowVersion, and Tiptap JSON.
  const draft = null as EditorArticleDraft | null
  const currentUserRole = null as KbUserRole | null
  const categories = emptyCategories

  // States
  const [title, setTitle] = useState(draft?.title ?? '')
  const [slug, setSlug] = useState(draft?.slug ?? '')
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? '')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Hooks
  const primaryActionLabel = useMemo(
    () => (currentUserRole === 'admin' || currentUserRole === 'reviewer' ? 'Publish' : 'Submit for Review'),
    [currentUserRole]
  )

  // Handlers
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
    // TODO: connect to backend API.
    // Authors submit drafts to /api/kb/reviews; reviewers/admins publish through /api/kb/articles/{articleId}/publish.
  }

  // Render
  return (
    <KbPageShell maxWidth='100%'>
      <PageHeader
        title='Article Editor'
        subtitle={currentUserRole ? `Editing as ${roleLabels[currentUserRole]}` : 'Draft metadata will load from the backend.'}
        actions={
          <>
            {draft ? (
              <StatusChip label={draft.status} color={articleStatusColor[draft.status]} />
            ) : (
              <StatusChip label='Not loaded' />
            )}
            <Button variant='outlined' startIcon={<Save size={18} />} onClick={handleSaveDraft}>
              Save Draft
            </Button>
            <Button variant='contained' startIcon={<CheckCircle2 size={18} />} onClick={handleWorkflowAction}>
              {primaryActionLabel}
            </Button>
          </>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: '280px minmax(0, 1fr)' },
          gap: 6,
          alignItems: 'start'
        }}
      >
        <Stack spacing={4}>
          <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}>
            <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
              <Stack spacing={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <BookOpen size={18} color='var(--mui-palette-primary-main)' />
                  <Typography variant='h6'>Category</Typography>
                </Box>
                <CustomTextField
                  select
                  label='Primary Category'
                  value={categoryId}
                  onChange={event => setCategoryId(event.target.value)}
                  fullWidth
                  disabled={!categories.length}
                >
                  {categories.map(category => (
                    <MenuItem key={category.id} value={category.id}>
                      {category.name}
                    </MenuItem>
                  ))}
                  {categories.flatMap(category =>
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
                <CategoryTree categories={categories} compact />
              </Stack>
            </CardContent>
          </Card>

          <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none' }}>
            <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
              <Stack spacing={3}>
                <Typography variant='h6'>Article Details</Typography>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Status
                  </Typography>
                  {draft ? (
                    <StatusChip label={draft.status} color={articleStatusColor[draft.status]} />
                  ) : (
                    <StatusChip label='Not loaded' />
                  )}
                </Box>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Version
                  </Typography>
                  <Typography color='text.primary'>{draft?.versionLabel ?? '-'}</Typography>
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

        <Card variant='outlined' sx={{ overflow: 'hidden', borderRadius: 2, boxShadow: 'none' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <Box sx={{ p: { xs: 4, md: 5 }, borderBlockEnd: theme => `1px solid ${theme.palette.divider}` }}>
              <Stack spacing={4}>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    alignItems: { md: 'center' },
                    justifyContent: 'space-between',
                    gap: 3
                  }}
                >
                  <Breadcrumbs aria-label='Editor breadcrumbs'>
                    <Link href={`/${lang}/articles`}>Articles</Link>
                    <Typography color='text.secondary'>{draft?.categoryPath ?? 'Draft'}</Typography>
                  </Breadcrumbs>
                  <Stack direction='row' spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {draft ? (
                      <StatusChip label={draft.status} color={articleStatusColor[draft.status]} />
                    ) : (
                      <StatusChip label='Not loaded' />
                    )}
                    <Chip size='small' label={draft ? 'Draft loaded' : 'Waiting for draft'} color='warning' variant='tonal' />
                  </Stack>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 280px' }, gap: 4 }}>
                  <CustomTextField
                    label='Article Title'
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder='Article title'
                    fullWidth
                    sx={{
                      '& .MuiInputBase-input': {
                        fontSize: { xs: 24, md: 30 },
                        lineHeight: 1.25,
                        fontWeight: 700,
                        color: 'text.primary'
                      }
                    }}
                  />
                  <CustomTextField
                    label='Slug'
                    value={slug}
                    onChange={event => setSlug(event.target.value)}
                    placeholder='article-slug'
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
                </Box>
              </Stack>
            </Box>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: { xs: 3, md: 5 },
                bgcolor: 'background.default'
              }}
            >
              <Box sx={{ inlineSize: '100%', maxInlineSize: 1120 }}>
                <EditorCanvas
                  content={draft?.content}
                  onChange={handleContentChange}
                  onChangeError={handleAutosaveError}
                />
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </KbPageShell>
  )
}

export default ArticleEditorShell
