'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Edit2, Plus, Trash2 } from 'lucide-react'

import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { KbCategoryNode } from '../types/categories'
import type { FlatCategory } from './utils/categoryTable'
import type { CategoryFormState } from './utils/categoryForm'
import { KbPageShell, KbSectionCard } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbCategoryDialog from './components/KbCategoryDialog'
import CategoryTree from '../shared/components/CategoryTree'
import PageHeader from '../shared/components/PageHeader'
import { getVisibleCategories } from './utils/categoryTable'
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  getCategoryTree,
  moveCategory,
  updateCategory
} from '@/lib/api/categories'
import { describeApiError } from '@/lib/api/http'

type CategoryManagementPageProps = {
  /** Supplied by the future company SSO/session integration. */
  accessToken?: string
}

const missingTokenMessage = 'Sign in through the company authentication provider before loading categories.'

const CategoryManagementPage = ({ accessToken = '' }: CategoryManagementPageProps) => {
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'name', direction: 'asc' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<KbCategoryNode | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<KbCategoryNode | undefined>()
  const [loading, setLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [pageErrors, setPageErrors] = useState<string[]>([])
  const [dialogErrors, setDialogErrors] = useState<string[]>([])

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) {
      setCategories([])
      setLoading(false)
      setPageErrors([missingTokenMessage])
      return
    }

    setLoading(true)
    setPageErrors([])

    try {
      setCategories(await getCategoryTree(accessToken, signal))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPageErrors(describeApiError(error))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadCategories(controller.signal)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadCategories])

  const closeDialog = useCallback(() => {
    if (mutating) return
    setDialogOpen(false)
    setEditingCategory(undefined)
    setDialogErrors([])
  }, [mutating])

  const openCreateDialog = useCallback(() => {
    setEditingCategory(undefined)
    setDialogErrors([])
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback(async (category: KbCategoryNode) => {
    if (!accessToken) {
      setPageErrors([missingTokenMessage])
      return
    }

    setPageErrors([])
    try {
      const details = await getCategoryById(category.id, accessToken)
      setEditingCategory({
        ...category,
        name: details.name,
        description: details.description ?? '',
        slug: details.slug,
        parentId: details.parentCategoryId,
        sortOrder: details.sortOrder,
        path: details.path,
        depth: details.depth,
        articleCount: details.articleCount
      })
      setDialogErrors([])
      setDialogOpen(true)
    } catch (error) {
      setPageErrors(describeApiError(error))
    }
  }, [accessToken])

  const handleDialogSubmit = useCallback(async (form: CategoryFormState) => {
    if (!accessToken || mutating) {
      setDialogErrors([missingTokenMessage])
      return
    }

    setMutating(true)
    setDialogErrors([])
    const parentCategoryId = form.parentCategoryId || null
    const description = form.description || null

    try {
      if (!editingCategory) {
        await createCategory({ name: form.name, description, parentCategoryId, sortOrder: form.sortOrder }, accessToken)
      } else {
        await updateCategory(editingCategory.id, { name: form.name, description, sortOrder: form.sortOrder }, accessToken)

        if (parentCategoryId !== editingCategory.parentId || form.sortOrder !== editingCategory.sortOrder) {
          await moveCategory(editingCategory.id, { parentCategoryId, sortOrder: form.sortOrder }, accessToken)
        }
      }

      setDialogOpen(false)
      setEditingCategory(undefined)
      await loadCategories()
    } catch (error) {
      setDialogErrors(describeApiError(error))
      await loadCategories()
    } finally {
      setMutating(false)
    }
  }, [accessToken, editingCategory, loadCategories, mutating])

  const handleDelete = useCallback(async () => {
    if (!accessToken || !deleteTarget || mutating) return

    setMutating(true)
    setPageErrors([])
    try {
      await deleteCategory(deleteTarget.id, accessToken)
      setDeleteTarget(undefined)
      await loadCategories()
    } catch (error) {
      setPageErrors(describeApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, deleteTarget, loadCategories, mutating])

  const flatCategories = useMemo(
    () => getVisibleCategories({ categories, search, sort }),
    [categories, search, sort]
  )

  const columns = useMemo<Array<KbDataTableColumn<FlatCategory>>>(
    () => [
      {
        id: 'name',
        label: 'Name',
        sortable: true,
        render: category => (
          <Box sx={{ display: 'flex', flexDirection: 'column', pl: category.depth * 4, minInlineSize: 240 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>{category.name}</Typography>
            <Typography variant='body2' color='text.secondary'>{category.description || 'No description'}</Typography>
          </Box>
        )
      },
      { id: 'slug', label: 'Slug', sortable: true, render: category => category.slug },
      { id: 'parentName', label: 'Parent', sortable: true, render: category => category.parentName },
      { id: 'articleCount', label: 'Articles', sortable: true, render: category => category.articleCount },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: category => (
          <>
            <Tooltip title='Edit category'>
              <IconButton size='small' disabled={mutating} onClick={() => void openEditDialog(category)}>
                <Edit2 size={18} />
              </IconButton>
            </Tooltip>
            <Tooltip title='Delete category'>
              <IconButton size='small' color='error' disabled={mutating} onClick={() => setDeleteTarget(category)}>
                <Trash2 size={18} />
              </IconButton>
            </Tooltip>
          </>
        )
      }
    ],
    [mutating, openEditDialog]
  )

  return (
    <KbPageShell>
      <PageHeader
        title='Categories'
        subtitle='Organize articles into a clean public navigation tree.'
        actions={<Button variant='contained' startIcon={<Plus size={18} />} disabled={mutating} onClick={openCreateDialog}>New Category</Button>}
      />

      <KbValidationSummary title='Categories could not be loaded or changed' errors={pageErrors} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr)' }, gap: 5, alignItems: 'start' }}>
        <KbSectionCard title='Category Tree' sx={{ position: { xl: 'sticky' }, top: { xl: 88 } }}>
          {loading ? <Alert severity='info'>Loading categories…</Alert> : <CategoryTree categories={categories} compact />}
        </KbSectionCard>

        <KbDataTable
          ariaLabel='Category management table'
          loading={loading}
          rows={flatCategories}
          columns={columns}
          getRowId={category => category.id}
          sort={sort}
          onSortChange={setSort}
          toolbar={<KbTableToolbar searchValue={search} onSearchChange={setSearch} searchPlaceholder='Search categories' columns={columns.map(column => ({ id: column.id, label: column.label, hideable: column.hideable }))} />}
          emptyState={{ title: 'No categories loaded', description: 'Start building your knowledge base by creating your first category.' }}
        />
      </Box>

      <KbCategoryDialog open={dialogOpen} category={editingCategory} categories={categories} submitting={mutating} errors={dialogErrors} onClose={closeDialog} onSubmit={handleDialogSubmit} />

      <KbConfirmDialog
        open={Boolean(deleteTarget)}
        title='Delete category?'
        description={deleteTarget ? `Delete “${deleteTarget.name}”? Categories with children or article references cannot be deleted.` : ''}
        confirmLabel='Delete'
        confirmColor='error'
        submitting={mutating}
        onClose={() => { if (!mutating) setDeleteTarget(undefined) }}
        onConfirm={() => void handleDelete()}
      />
    </KbPageShell>
  )
}

export default CategoryManagementPage
