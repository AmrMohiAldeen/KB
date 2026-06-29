'use client'

import { useState } from 'react'

import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'

import CustomTextField from '@core/components/mui/TextField'

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
  categories,
  onClose
}: {
  category?: KbCategoryNode
  categories: KbCategoryNode[]
  onClose: () => void
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

  const handleSubmit = () => {
    // TODO: connect to backend category API.
    // Create: POST /api/kb/categories with name, subtitle, slug, parentId.
    // Update: PATCH /api/kb/categories/{categoryId} with rowVersion for concurrency.
    onClose()
  }

  return (
    <>
      <DialogContent>
        <Stack spacing={4} className='pbs-2'>
          <CustomTextField
            label='Name'
            value={form.name}
            onChange={event => handleNameChange(event.target.value)}
            placeholder='Getting Started'
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
            placeholder='getting-started'
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
        </Stack>
      </DialogContent>
      <DialogActions className='pli-6 pbs-0 pbe-6'>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button variant='contained' onClick={handleSubmit}>
          {category ? 'Update Category' : 'Create Category'}
        </Button>
      </DialogActions>
    </>
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>{category ? 'Edit Category' : 'New Category'}</DialogTitle>
      <KbCategoryDialogForm key={formKey} category={category} categories={categories} onClose={onClose} />
    </Dialog>
  )
}

export default KbCategoryDialog
