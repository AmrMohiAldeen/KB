'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { FileText, Folder, MoreHorizontal, Plus } from 'lucide-react'

// Type Imports
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { ArticleFilter, KbListRow } from '../types/articles'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbCategoryDialog from '../categories/components/KbCategoryDialog'
import CategoryTree from '../shared/components/CategoryTree'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'

// Config Imports
import { articleFilterLabels, articleStatusColor, articleStatuses } from '../config/articles'

// Data Imports
import { emptyArticleRows } from '../data/articles'
import { emptyCategories } from '../data/categories'

// Util Imports
import { formatDate } from '../shared/utils/formatDate'
import { getArticleFilterCounts, getVisibleArticleRows } from './utils/articleRows'

const ArticlesDashboard = () => {
  // States
  const [activeFilter, setActiveFilter] = useState<ArticleFilter>('Everything')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'name', direction: 'asc' })
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [visibleColumnIds, setVisibleColumnIds] = useState(['name', 'status', 'owner', 'updated', 'views', 'actions'])
  const [dialogOpen, setDialogOpen] = useState(false)

  // Vars
  const rows = emptyArticleRows
  const categories = emptyCategories

  // Hooks
  const filterCounts = useMemo<Record<ArticleFilter, number>>(() => {
    // TODO: connect to backend API.
    // Counts should come from GET /api/kb/articles/summary or the article list response metadata.
    return getArticleFilterCounts(rows, articleFilterLabels)
  }, [rows])

  const visibleRows = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/kb/articles should accept filter, search, sort, pagination, and categoryId.
    return getVisibleArticleRows({ rows, filter: activeFilter, search, sort })
  }, [activeFilter, rows, search, sort])

  // Columns
  const columns = useMemo<Array<KbDataTableColumn<KbListRow>>>(
    () => [
      {
        id: 'name',
        label: 'Name',
        sortable: true,
        render: row => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minInlineSize: 260 }}>
            {row.kind === 'category' ? (
              <Folder size={20} color='var(--mui-palette-text-secondary)' />
            ) : (
              <FileText size={20} color='var(--mui-palette-text-secondary)' />
            )}
            <Box sx={{ minInlineSize: 0 }}>
              <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>
                {row.kind === 'category' ? `${row.name} (${row.articleCount})` : row.article.title}
              </Typography>
              <Typography variant='body2' color='text.secondary' noWrap>
                {row.kind === 'category' ? 'Category' : `${row.article.categoryPath} / ${row.article.versionLabel}`}
              </Typography>
            </Box>
          </Box>
        )
      },
      {
        id: 'status',
        label: 'Status Counts',
        sortable: true,
        render: row =>
          row.kind === 'category' ? (
            <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap', maxInlineSize: 460 }}>
              {articleStatuses.map(status => (
                <StatusChip
                  key={status}
                  label={`${row.statusCounts[status]} ${status}`}
                  color={articleStatusColor[status]}
                />
              ))}
            </Stack>
          ) : (
            <StatusChip label={row.article.status} color={articleStatusColor[row.article.status]} />
          )
      },
      {
        id: 'owner',
        label: 'Owner',
        sortable: true,
        render: row => (row.kind === 'category' ? 'Organization' : row.article.ownerName)
      },
      {
        id: 'updated',
        label: 'Updated',
        sortable: true,
        render: row => formatDate(row.kind === 'category' ? row.updatedAt : row.article.updatedAt)
      },
      {
        id: 'views',
        label: 'Views',
        sortable: true,
        align: 'right',
        render: row => (row.kind === 'category' ? '-' : row.article.views.toLocaleString())
      },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: row => (
          <IconButton
            size='small'
            aria-label={`Open ${row.kind === 'category' ? row.name : row.article.title} actions`}
            disabled
          >
            <MoreHorizontal size={18} />
          </IconButton>
        )
      }
    ],
    []
  )

  // Render
  return (
    <KbPageShell>
      <PageHeader
        title='Articles'
        subtitle='Manage categories, drafts, reviews, published content, and archived knowledge base articles.'
        actions={
          <>
            <Button variant='outlined' startIcon={<Plus size={18} />} onClick={() => setDialogOpen(true)}>
              New Category
            </Button>
            <Button
              variant='contained'
              startIcon={<Plus size={18} />}
              onClick={() => {
                // TODO: connect to backend API.
                // POST /api/kb/articles should create article drafts.
              }}
            >
              New Article
            </Button>
          </>
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
        <Card variant='outlined' sx={{ position: { xl: 'sticky' }, top: { xl: 88 }, borderRadius: 2, boxShadow: 'none' }}>
          <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
            <Stack spacing={5}>
              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>
                  Articles
                </Typography>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {articleFilterLabels.map(filter => (
                    <Button
                      key={filter}
                      fullWidth
                      variant={activeFilter === filter ? 'tonal' : 'text'}
                      color={activeFilter === filter ? 'primary' : 'secondary'}
                      onClick={() => setActiveFilter(filter)}
                      sx={{
                        justifyContent: 'space-between',
                        minBlockSize: 38,
                        px: 3,
                        borderRadius: 1.5,
                        '& .MuiButton-endIcon': { m: 0 }
                      }}
                    >
                      <span>{filter}</span>
                      <span>{filterCounts[filter] ?? 0}</span>
                    </Button>
                  ))}
                </Stack>
              </Box>
              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>
                  Categories
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <CategoryTree categories={categories} compact />
                </Box>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <KbDataTable
          ariaLabel='Articles dashboard table'
          rows={visibleRows}
          columns={columns}
          getRowId={row => (row.kind === 'category' ? row.id : row.article.id)}
          enableSelection
          selectedRowIds={selectedRows}
          onSelectedRowIdsChange={setSelectedRows}
          visibleColumnIds={visibleColumnIds}
          sort={sort}
          onSortChange={setSort}
          toolbar={
            <KbTableToolbar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder='Search articles or categories'
              selectedCount={selectedRows.length}
              columns={columns.map(column => ({ id: column.id, label: column.label, hideable: column.hideable }))}
              visibleColumnIds={visibleColumnIds}
              onVisibleColumnIdsChange={setVisibleColumnIds}
              filters={
                <CustomTextField
                  select
                  label='Status'
                  value={activeFilter}
                  onChange={event => setActiveFilter(event.target.value as ArticleFilter)}
                  sx={{ inlineSize: { xs: '100%', md: 180 } }}
                >
                  {articleFilterLabels.map(filter => (
                    <MenuItem key={filter} value={filter}>
                      {filter}
                    </MenuItem>
                  ))}
                </CustomTextField>
              }
              actions={
                <Button variant='outlined' color='secondary' disabled={!visibleRows.length}>
                  Actions
                </Button>
              }
            />
          }
          emptyState={{
            title: 'No articles loaded',
            description: 'Article and category rows will appear here after the backend article API is connected.'
          }}
          pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleRows.length }}
        />
      </Box>

      <KbCategoryDialog open={dialogOpen} categories={categories} onClose={() => setDialogOpen(false)} />
    </KbPageShell>
  )
}

export default ArticlesDashboard
