'use client'

import { useState } from 'react'

import MenuItem from '@mui/material/MenuItem'

import CustomTextField from '@core/components/mui/TextField'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'

import type { KbCategoryNode } from './kbMockData'

type CategoryFormState = {
  name: string
  subtitle: string
  slug: string
  parentId: string
}

const emptyForm: CategoryFormState = {
  name: '',
  subtitle: '',
  slug: '',
  parentId: ''
}

const getInitialForm = (category?: KbCategoryNode): CategoryFormState =>
  category
    ? {
        name: category.name,
        subtitle: category.subtitle,
        slug: category.slug,
        parentId: category.parentId ?? ''
      }
    : emptyForm

const flattenCategories = (categories: KbCategoryNode[]): KbCategoryNode[] =>
  categories.flatMap(category => [category, ...(category.children ? flattenCategories(category.children) : [])])

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const KbCategoryDialogForm = ({
  category,
  categories
}: {
  category?: KbCategoryNode
  categories: KbCategoryNode[]
}) => {
  const [form, setForm] = useState<CategoryFormState>(() => getInitialForm(category))
  const categoryOptions = flattenCategories(categories).filter(option => option.id !== category?.id)

  const handleNameChange = (name: string) => {
    setForm(current => ({
      ...current,
      name,
      slug: current.slug ? current.slug : toSlug(name)
    }))
  }

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
  const formKey = open ? category?.id ?? 'new-category' : 'closed'
  const handleSubmit = () => {
    // TODO: connect to backend category API.
    // Create: POST /api/kb/categories with name, subtitle, slug, parentId.
    // Update: PATCH /api/kb/categories/{categoryId} with rowVersion for concurrency.
    onClose()
  }

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
