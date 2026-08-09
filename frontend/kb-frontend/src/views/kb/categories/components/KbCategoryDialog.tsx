'use client'

import { useEffect, useState } from 'react'
import MenuItem from '@mui/material/MenuItem'

import type { KbCategoryNode } from '../../types/categories'
import CustomTextField from '@core/components/mui/TextField'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import {
  getCategoryOptions,
  getInitialCategoryForm,
  type CategoryFormState
} from '../utils/categoryForm'

type KbCategoryDialogProps = {
  open: boolean
  category?: KbCategoryNode
  categories: KbCategoryNode[]
  submitting?: boolean
  errors?: string[]
  onClose: () => void
  onSubmit?: (form: CategoryFormState) => Promise<void>
}

export const KbCategoryDialog = ({
  open,
  category,
  categories,
  submitting = false,
  errors = [],
  onClose,
  onSubmit
}: KbCategoryDialogProps) => {
  const [form, setForm] = useState(() => getInitialCategoryForm(category))
  const [clientErrors, setClientErrors] = useState<string[]>([])
  const categoryOptions = getCategoryOptions(categories, category)

  useEffect(() => {
    if (!open) return

    const timer = window.setTimeout(() => {
      setForm(getInitialCategoryForm(category))
      setClientErrors([])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, category])

  const handleSubmit = async () => {
    const validationErrors: string[] = []
    const name = form.name.trim()
    const slug = form.slug.trim()
    const description = form.description.trim()

    if (!name) validationErrors.push('Name is required.')
    if (name.length > 200) validationErrors.push('Name cannot exceed 200 characters.')
    if (category && !slug) validationErrors.push('Slug is required.')
    if (slug.length > 250) validationErrors.push('Slug cannot exceed 250 characters.')
    if (description.length > 1000) validationErrors.push('Description cannot exceed 1000 characters.')
    if (!Number.isInteger(form.sortOrder) || form.sortOrder < 0)
      validationErrors.push('Sort order must be a non-negative integer.')

    setClientErrors(validationErrors)
    if (validationErrors.length) return

    if (onSubmit)
      await onSubmit({ ...form, name, slug, description })
  }

  return (
    <KbFormDialog
      open={open}
      title={category ? 'Edit Category' : 'New Category'}
      description='Categories structure navigation only and do not define permissions.'
      submitLabel={onSubmit ? category ? 'Update Category' : 'Create Category' : 'Close'}
      submitting={submitting}
      onClose={onClose}
      onSubmit={() => {
        if (onSubmit) void handleSubmit()
        else onClose()
      }}
    >
      <KbFormGrid columns={1}>
        <KbValidationSummary errors={[...clientErrors, ...errors]} />
        <CustomTextField
          label='Name'
          value={form.name}
          onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          placeholder='Category name'
          required
          fullWidth
        />
        <CustomTextField
          label='Slug'
          value={form.slug}
          onChange={event => setForm(current => ({ ...current, slug: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 250 } }}
          helperText={category
            ? 'Changing the slug changes links to this category.'
            : 'Optional. The backend generates a unique slug from the name when left blank.'}
          required={Boolean(category)}
          fullWidth
        />
        <CustomTextField
          label='Description'
          value={form.description}
          onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
          placeholder='Category description'
          fullWidth
          multiline
          minRows={2}
        />
        <CustomTextField
          select
          label='Parent Category'
          value={form.parentCategoryId}
          onChange={event => setForm(current => ({ ...current, parentCategoryId: event.target.value }))}
          fullWidth
        >
          <MenuItem value=''>Top level</MenuItem>
          {categoryOptions.map(option => (
            <MenuItem key={option.id} value={option.id}>
              {option.name}
            </MenuItem>
          ))}
        </CustomTextField>
        <CustomTextField
          label='Sort Order'
          type='number'
          value={form.sortOrder}
          onChange={event => setForm(current => ({ ...current, sortOrder: Number(event.target.value) }))}
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
          fullWidth
        />
      </KbFormGrid>
    </KbFormDialog>
  )
}

export default KbCategoryDialog
