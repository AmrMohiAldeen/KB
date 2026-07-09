'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import MenuItem from '@mui/material/MenuItem'

// Type Imports
import type { KbCategoryNode } from '../../types/categories'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'

// Util Imports
import { getCategoryOptions, getInitialCategoryForm, toSlug } from '../utils/categoryForm'

const KbCategoryDialogForm = ({
  category,
  categories
}: {
  category?: KbCategoryNode
  categories: KbCategoryNode[]
}) => {
  // States
  const [form, setForm] = useState(() => getInitialCategoryForm(category))

  // Vars
  const categoryOptions = getCategoryOptions(categories, category)

  // Handlers
  const handleNameChange = (name: string) => {
    setForm(current => ({
      ...current,
      name,
      slug: current.slug ? current.slug : toSlug(name)
    }))
  }

  // Render
  return (
    <KbFormGrid columns={1}>
      <CustomTextField
        label='Name'
        value={form.name}
        onChange={event => handleNameChange(event.target.value)}
        placeholder='Category name'
        fullWidth
      />
      <CustomTextField
        label='Description'
        value={form.subtitle}
        onChange={event => setForm(current => ({ ...current, subtitle: event.target.value }))}
        placeholder='Short category subtitle'
        fullWidth
        multiline
        minRows={2}
      />
      <CustomTextField
        label='Slug'
        value={form.slug}
        onChange={event => setForm(current => ({ ...current, slug: toSlug(event.target.value) }))}
        placeholder='category-slug'
        fullWidth
      />
      <CustomTextField
        select
        label='Parent Category'
        value={form.parentId}
        onChange={event => setForm(current => ({ ...current, parentId: event.target.value }))}
        fullWidth
      >
        <MenuItem value=''>Top level</MenuItem>
        {categoryOptions.map(option => (
          <MenuItem key={option.id} value={option.id}>
            {option.name}
          </MenuItem>
        ))}
      </CustomTextField>
    </KbFormGrid>
  )
}

export const KbCategoryDialog = ({
  open,
  category,
  categories,
  onClose
}: {
  open: boolean
  category?: KbCategoryNode
  categories: KbCategoryNode[]
  onClose: () => void
}) => {
  // Vars
  const formKey = open ? category?.id ?? 'new-category' : 'closed'

  // Handlers
  const handleSubmit = () => {
    // TODO: connect to backend API.
    // Create: POST /api/kb/categories with name, subtitle, slug, parentId.
    // Update: PATCH /api/kb/categories/{categoryId} with rowVersion for concurrency.
    onClose()
  }

  // Render
  return (
    <KbFormDialog
      open={open}
      title={category ? 'Edit Category' : 'New Category'}
      description='Categories structure navigation only and do not define permissions.'
      submitLabel={category ? 'Update Category' : 'Create Category'}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <KbCategoryDialogForm key={formKey} category={category} categories={categories} />
    </KbFormDialog>
  )
}

export default KbCategoryDialog
