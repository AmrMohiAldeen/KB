'use client'

// React Imports
import { useCallback, useMemo, useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { Edit2, Plus } from 'lucide-react'

// Type Imports
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { KbCategoryNode } from '../types/categories'
import type { FlatCategory } from './utils/categoryTable'

// Component Imports
import { KbPageShell, KbSectionCard } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbCategoryDialog from './components/KbCategoryDialog'
import CategoryTree from '../shared/components/CategoryTree'
import PageHeader from '../shared/components/PageHeader'

// Data Imports
import { emptyCategories } from '../data/categories'

// Util Imports
import { formatDate } from '../shared/utils/formatDate'
import { getVisibleCategories } from './utils/categoryTable'

const CategoryManagementPage = () => {
  // States
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'name', direction: 'asc' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<KbCategoryNode | undefined>()

  // Vars
  const categories = emptyCategories

  // Handlers
  const openCreateDialog = useCallback(() => {
    setEditingCategory(undefined)
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((category: KbCategoryNode) => {
    setEditingCategory(category)
    setDialogOpen(true)
  }, [])

  // Hooks
  const flatCategories = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/kb/categories should return the category tree with article counts and no permission fields.
    return getVisibleCategories({ categories, search, sort })
  }, [categories, search, sort])

  // Columns
  const columns = useMemo<Array<KbDataTableColumn<FlatCategory>>>(
    () => [
      {
        id: 'name',
        label: 'Name',
        sortable: true,
        render: category => (
          <Box sx={{ display: 'flex', flexDirection: 'column', pl: category.depth * 4, minInlineSize: 240 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              {category.name}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {category.subtitle || 'Category description will load from the backend.'}
            </Typography>
          </Box>
        )
      },
      { id: 'slug', label: 'Slug', sortable: true, render: category => category.slug },
      { id: 'parentName', label: 'Parent', sortable: true, render: category => category.parentName },
      { id: 'articleCount', label: 'Articles', sortable: true, render: category => category.articleCount },
      { id: 'updatedAt', label: 'Updated', sortable: true, render: category => formatDate(category.updatedAt) },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: category => (
          <Tooltip title='Edit category'>
            <IconButton size='small' onClick={() => openEditDialog(category)}>
              <Edit2 size={18} />
            </IconButton>
          </Tooltip>
        )
      }
    ],
    [openEditDialog]
  )

  // Render
  return (
    <KbPageShell>
      <PageHeader
        title='Categories'
        subtitle='Organize articles into a clean public navigation tree.'
        actions={
          <Button variant='contained' startIcon={<Plus size={18} />} onClick={openCreateDialog}>
            New Category
          </Button>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr)' },
          gap: 5,
          alignItems: 'start'
        }}
      >
        <KbSectionCard title='Category Tree' sx={{ position: { xl: 'sticky' }, top: { xl: 88 } }}>
          <CategoryTree categories={categories} compact />
        </KbSectionCard>

        <KbDataTable
          ariaLabel='Category management table'
          rows={flatCategories}
          columns={columns}
          getRowId={category => category.id}
          sort={sort}
          onSortChange={setSort}
          toolbar={
            <KbTableToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder='Search categories'
              columns={columns.map(column => ({ id: column.id, label: column.label, hideable: column.hideable }))}
            />
          }
          emptyState={{
            title: 'No categories loaded',
            description: 'Category rows will appear here after the backend category API is connected.'
          }}
          pagination={{ page: 0, rowsPerPage: 10, totalRows: flatCategories.length }}
        />
      </Box>

      <KbCategoryDialog
        open={dialogOpen}
        category={editingCategory}
        categories={categories}
        onClose={() => setDialogOpen(false)}
      />
    </KbPageShell>
  )
}

export default CategoryManagementPage
