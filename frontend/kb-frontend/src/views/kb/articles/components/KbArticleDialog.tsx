'use client'

// React Imports
import { useEffect, useMemo, useState } from 'react'

// MUI Imports
import MenuItem from '@mui/material/MenuItem'

// Type Imports
import type { ArticleDetailsResponse, CreateArticleRequest } from '@/types/apps/articleTypes'
import type { KbCategoryNode } from '../../types/categories'

// Components Imports
import CustomTextField from '@core/components/mui/TextField'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import { getCategoryOptions } from '../../categories/utils/categoryForm'

export type ArticleFormState = CreateArticleRequest

type KbArticleDialogProps = {
  open: boolean
  article?: ArticleDetailsResponse
  categories: KbCategoryNode[]
  submitting?: boolean
  errors?: string[]
  onClose: () => void
  onSubmit: (form: ArticleFormState) => Promise<void>
}

const getInitialForm = (article?: ArticleDetailsResponse): ArticleFormState => ({
  title: article?.title ?? '',
  slug: article?.slug ?? '',
  categoryId: article?.category?.categoryId ?? '',
  visibility: article?.visibility ?? 'Public'
})

export const KbArticleDialog = ({
  open,
  article,
  categories,
  submitting = false,
  errors = [],
  onClose,
  onSubmit
}: KbArticleDialogProps) => {
  // States
  const [form, setForm] = useState<ArticleFormState>(() => getInitialForm(article))
  const [clientErrors, setClientErrors] = useState<string[]>([])
  const categoryOptions = useMemo(() => getCategoryOptions(categories), [categories])

  // Hooks
  useEffect(() => {
    if (!open) return

    const timer = window.setTimeout(() => {
      setForm(getInitialForm(article))
      setClientErrors([])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [article, open])

  // Handlers 
  const handleSubmit = async () => {
    const title = form.title.trim()
    const slug = form.slug?.trim() || null
    const validationErrors: string[] = []

    if (!title) validationErrors.push('Title is required.')
    if (title.length > 300) validationErrors.push('Title cannot exceed 300 characters.')
    if (!form.categoryId) validationErrors.push('Category is required.')
    if (slug && slug.length > 350) validationErrors.push('Slug cannot exceed 350 characters.')

    setClientErrors(validationErrors)
    if (validationErrors.length) return

    await onSubmit({ title, slug, categoryId: form.categoryId, visibility: form.visibility ?? 'Public' })
  }

  return (
    <KbFormDialog
      open={open}
      title={article ? 'Edit Article Metadata' : 'New Article'}
      description='Article ownership and workflow state are managed by the backend.'
      submitLabel={article ? 'Update Article' : 'Create Article'}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => void handleSubmit()}
    >
      <KbFormGrid columns={1}>
        <KbValidationSummary errors={[...clientErrors, ...errors]} />
        <CustomTextField
          label='Title'
          value={form.title}
          onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 300 } }}
          required
          fullWidth
        />
        <CustomTextField
          label='Slug'
          value={form.slug ?? ''}
          onChange={event => setForm(current => ({ ...current, slug: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 350 } }}
          helperText='Optional when creating. The backend generates a unique slug when left blank.'
          fullWidth
        />
        <CustomTextField
          select
          label='Visibility'
          value={form.visibility}
          onChange={event => setForm(current => ({ ...current, visibility: event.target.value as 'Public' | 'Internal' }))}
          helperText='Public content is available to anyone. Internal content requires an authenticated internal account.'
          required
          fullWidth
        >
          <MenuItem value='Public'>Public</MenuItem>
          <MenuItem value='Internal'>Internal</MenuItem>
        </CustomTextField>
        <CustomTextField
          select
          label='Category'
          value={form.categoryId}
          onChange={event => setForm(current => ({ ...current, categoryId: event.target.value }))}
          required
          fullWidth
        >
          <MenuItem value='' disabled>
            Select a category
          </MenuItem>
          {categoryOptions.map(category => (
            <MenuItem key={category.id} value={category.id}>
              {`${'— '.repeat(category.depth)}${category.name}`}
            </MenuItem>
          ))}
        </CustomTextField>
      </KbFormGrid>
    </KbFormDialog>
  )
}

export default KbArticleDialog
