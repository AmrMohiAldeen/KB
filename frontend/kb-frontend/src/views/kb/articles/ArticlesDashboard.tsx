'use client'
// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// Next Imports
import { useParams, useRouter } from 'next/navigation'

// MUI Imports
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react'

// Component Imports
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbArticleDialog, { type ArticleFormState } from './components/KbArticleDialog'
import CategoryTree from '../shared/components/CategoryTree'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'

// Type Imports 
import type { ArticleDetailsResponse, ArticleListItemResponse, ArticleSortField } from '@/types/apps/articleTypes'
import type { KbCategoryNode } from '../types/categories'
import type { ArticleFilter } from '../types/articles'

// Config Imports
import { articleFilterLabels, articleStatusColor, articleStatusLabel } from '../config/articles'

// Util Imports
import { formatDate } from '../shared/utils/formatDate'
import { getCategoryOptions } from '../categories/utils/categoryForm'
import { getCategoryTree } from '@/lib/api/categories'
import {
  createArticle,
  deleteArticle,
  describeArticleApiError,
  getArticleById,
  getArticles,
  updateArticle
} from '@/lib/api/articlesApi'
import { ApiError, describeApiError } from '@/lib/api/http'
import { getLocalizedUrl } from '@/utils/i18n'

type ArticlesDashboardProps = {
  /** Supplied by the future company SSO/session integration. */
  accessToken?: string
}

const missingTokenMessage = 'Sign in through the company authentication provider before loading articles.'
const sortFieldByColumn: Record<string, ArticleSortField> = {
  name: 'title',
  created: 'createdAt',
  updated: 'updatedAt'
}

const ArticlesDashboard = ({ accessToken = '' }: ArticlesDashboardProps) => {

  // States
  const router = useRouter()
  const { lang } = useParams<{ lang: string }>()
  const [articles, setArticles] = useState<ArticleListItemResponse[]>([])
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<ArticleFilter>('Everything')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'updated', direction: 'desc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [visibleColumnIds, setVisibleColumnIds] = useState([
    'name', 'status', 'category', 'owner', 'updated', 'published', 'lock', 'actions'
  ])
  const [loading, setLoading] = useState(true)
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [mutating, setMutating] = useState(false)
  const [detailsLoadingId, setDetailsLoadingId] = useState<string>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingArticle, setEditingArticle] = useState<ArticleDetailsResponse>()
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItemResponse>()
  const [pageErrors, setPageErrors] = useState<string[]>([])
  const [categoryErrors, setCategoryErrors] = useState<string[]>([])
  const [dialogErrors, setDialogErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')

  // Hooks 
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)

    return () => window.clearTimeout(timer)
  }, [search])

  const loadArticles = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) {
      setArticles([])
      setTotalCount(0)
      setLoading(false)
      setPageErrors([missingTokenMessage])
      return
    }

    setLoading(true)
    setPageErrors([])

    try {
      const response = await getArticles({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        status: activeFilter === 'Everything' ? undefined : activeFilter,
        page: page + 1,
        pageSize,
        sortBy: sortFieldByColumn[sort.columnId] ?? 'updatedAt',
        sortDirection: sort.direction
      }, accessToken, signal)

      setArticles(response.items)
      setTotalCount(response.totalCount)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setArticles([])
      setTotalCount(0)
      setPageErrors(describeArticleApiError(error))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, activeFilter, categoryId, debouncedSearch, page, pageSize, sort])

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) {
      setCategories([])
      setCategoriesLoading(false)
      return
    }

    setCategoriesLoading(true)
    setCategoryErrors([])

    try {
      setCategories(await getCategoryTree(accessToken, signal))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setCategoryErrors(describeApiError(error))
    } finally {
      if (!signal?.aborted) setCategoriesLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadArticles(controller.signal), 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadArticles])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadCategories(controller.signal), 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadCategories])

  const categoryOptions = useMemo(() => getCategoryOptions(categories), [categories])

  const closeDialog = useCallback(() => {
    if (mutating) return
    setDialogOpen(false)
    setEditingArticle(undefined)
    setDialogErrors([])
  }, [mutating])

  const openCreateDialog = useCallback(() => {
    setEditingArticle(undefined)
    setDialogErrors([])
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback(async (article: ArticleListItemResponse) => {
    if (!accessToken || detailsLoadingId) {
      if (!accessToken) setPageErrors([missingTokenMessage])
      return
    }

    setDetailsLoadingId(article.articleId)
    setPageErrors([])

    try {
      const details = await getArticleById(article.articleId, accessToken)
      setEditingArticle(details)
      setDialogErrors([])
      setDialogOpen(true)
    } catch (error) {
      setPageErrors(describeArticleApiError(error))
    } finally {
      setDetailsLoadingId(undefined)
    }
  }, [accessToken, detailsLoadingId])

  // Handlers 
  const handleDialogSubmit = useCallback(async (form: ArticleFormState) => {
    if (!accessToken || mutating) {
      setDialogErrors([missingTokenMessage])
      return
    }

    setMutating(true)
    setDialogErrors([])
    setSuccessMessage('')

    try {
      const isCreate = !editingArticle

      if (editingArticle) {
        const rowVersion = editingArticle.currentDraft?.rowVersion

        if (!rowVersion) {
          setDialogErrors(['This article has no current draft row-version token and cannot be updated from this dialog.'])
          return
        }

        await updateArticle(editingArticle.articleId, { ...form, rowVersion }, accessToken)
        setSuccessMessage(`“${form.title}” was updated.`)
      } else {
        await createArticle(form, accessToken)
        setSuccessMessage(`“${form.title}” was created.`)
      }

      setDialogOpen(false)
      setEditingArticle(undefined)

      if (isCreate && page !== 0) setPage(0)
      else await loadArticles()
    } catch (error) {
      setDialogErrors(describeArticleApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, editingArticle, loadArticles, mutating, page])

  const refreshAfterDelete = useCallback(async () => {
    if (articles.length === 1 && page > 0) setPage(current => current - 1)
    else await loadArticles()
  }, [articles.length, loadArticles, page])

  const handleDelete = useCallback(async () => {
    if (!accessToken || !deleteTarget || mutating) return

    setMutating(true)
    setPageErrors([])
    setSuccessMessage('')

    try {
      await deleteArticle(deleteTarget.articleId, accessToken)
      setSuccessMessage(`“${deleteTarget.title}” was deleted.`)
      setDeleteTarget(undefined)
      await refreshAfterDelete()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setSuccessMessage(`“${deleteTarget.title}” was already removed.`)
        setDeleteTarget(undefined)
        await refreshAfterDelete()
      } else {
        setPageErrors(describeArticleApiError(error))
      }
    } finally {
      setMutating(false)
    }
  }, [accessToken, deleteTarget, mutating, refreshAfterDelete])

  const navigateToEditor = useCallback((articleId: string) => {
    router.push(getLocalizedUrl(`/editor?articleId=${encodeURIComponent(articleId)}`, lang))
  }, [lang, router])

  // Columns
  const columns = useMemo<Array<KbDataTableColumn<ArticleListItemResponse>>>(() => [
    {
      id: 'name',
      label: 'Title',
      sortable: true,
      render: article => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minInlineSize: 260 }}>
          <FileText size={20} color='var(--mui-palette-text-secondary)' />
          <Box sx={{ minInlineSize: 0 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>{article.title}</Typography>
            <Typography variant='body2' color='text.secondary' noWrap>{article.slug}</Typography>
          </Box>
        </Box>
      )
    },
    {
      id: 'status',
      label: 'Status',
      render: article => (
        <StatusChip label={articleStatusLabel[article.status]} color={articleStatusColor[article.status]} />
      )
    },
    {
      id: 'category',
      label: 'Category',
      render: article => article.category?.name ?? 'Uncategorized'
    },
    { id: 'owner', label: 'Owner', render: article => article.owner.fullName },
    { id: 'updated', label: 'Updated', sortable: true, render: article => formatDate(article.updatedAt) },
    { id: 'published', label: 'Published', render: article => article.publishedAt ? formatDate(article.publishedAt) : '—' },
    {
      id: 'lock',
      label: 'Lock',
      render: article => article.isCurrentDraftLocked ? `Locked by ${article.lockedBy?.fullName ?? 'another user'}` : 'Unlocked'
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      hideable: false,
      render: article => (
        <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title='Open editor'>
            <IconButton size='small' onClick={() => navigateToEditor(article.articleId)} aria-label={`Open ${article.title} editor`}>
              <ExternalLink size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title='Edit metadata'>
            <IconButton
              size='small'
              disabled={mutating || Boolean(detailsLoadingId)}
              loading={detailsLoadingId === article.articleId}
              onClick={() => void openEditDialog(article)}
              aria-label={`Edit ${article.title}`}
            >
              <Pencil size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title='Delete article'>
            <IconButton
              size='small'
              color='error'
              disabled={mutating}
              onClick={() => setDeleteTarget(article)}
              aria-label={`Delete ${article.title}`}
            >
              <Trash2 size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
      )
    }
  ], [detailsLoadingId, mutating, navigateToEditor, openEditDialog])

  const handleFilterChange = (filter: ArticleFilter) => {
    setActiveFilter(filter)
    setPage(0)
    setSelectedRows([])
  }

  return (
    <KbPageShell>
      <PageHeader
        title='Articles'
        subtitle='Manage article metadata, drafts, reviews, and published knowledge base content.'
        actions={
          <>
            <Button variant='outlined' startIcon={<Plus size={18} />} onClick={() => router.push(getLocalizedUrl('/categories', lang))}>
              New Category
            </Button>
            <Button variant='contained' startIcon={<Plus size={18} />} disabled={mutating} onClick={openCreateDialog}>
              New Article
            </Button>
          </>
        }
      />

      <KbValidationSummary title='Articles could not be loaded or changed' errors={[...pageErrors, ...categoryErrors]} />
      {successMessage && <Alert severity='success' onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '300px minmax(0, 1fr)' }, gap: 5, alignItems: 'start' }}>
        <Card variant='outlined' sx={{ position: { xl: 'sticky' }, top: { xl: 88 }, borderRadius: 2, boxShadow: 'none' }}>
          <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
            <Stack spacing={5}>
              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>Articles</Typography>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  {articleFilterLabels.map(filter => (
                    <Button
                      key={filter}
                      fullWidth
                      variant={activeFilter === filter ? 'tonal' : 'text'}
                      color={activeFilter === filter ? 'primary' : 'secondary'}
                      onClick={() => handleFilterChange(filter)}
                      sx={{ justifyContent: 'space-between', minBlockSize: 38, px: 3, borderRadius: 1.5 }}
                    >
                      <span>{filter === 'Everything' ? filter : articleStatusLabel[filter]}</span>
                      {activeFilter === filter && <span>{totalCount}</span>}
                    </Button>
                  ))}
                </Stack>
              </Box>
              <Box>
                <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>Categories</Typography>
                <Box sx={{ mt: 2 }}>
                  {categoriesLoading ? <Alert severity='info'>Loading categories…</Alert> : <CategoryTree categories={categories} compact />}
                </Box>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <KbDataTable
          ariaLabel='Articles dashboard table'
          loading={loading}
          rows={articles}
          columns={columns}
          getRowId={article => article.articleId}
          enableSelection
          selectedRowIds={selectedRows}
          onSelectedRowIdsChange={setSelectedRows}
          visibleColumnIds={visibleColumnIds}
          sort={sort}
          onSortChange={nextSort => {
            setSort(nextSort)
            setPage(0)
            setSelectedRows([])
          }}
          toolbar={
            <KbTableToolbar
              searchValue={search}
              onSearchChange={value => {
                setSearch(value)
                setPage(0)
                setSelectedRows([])
              }}
              searchPlaceholder='Search articles'
              selectedCount={selectedRows.length}
              columns={columns.map(column => ({ id: column.id, label: column.label, hideable: column.hideable }))}
              visibleColumnIds={visibleColumnIds}
              onVisibleColumnIdsChange={setVisibleColumnIds}
              filters={
                <>
                  <CustomTextField
                    select
                    label='Status'
                    value={activeFilter}
                    onChange={event => handleFilterChange(event.target.value as ArticleFilter)}
                    sx={{ inlineSize: { xs: '100%', md: 190 } }}
                  >
                    {articleFilterLabels.map(filter => (
                      <MenuItem key={filter} value={filter}>
                        {filter === 'Everything' ? filter : articleStatusLabel[filter]}
                      </MenuItem>
                    ))}
                  </CustomTextField>
                  <CustomTextField
                    select
                    label='Category'
                    value={categoryId}
                    onChange={event => {
                      setCategoryId(event.target.value)
                      setPage(0)
                      setSelectedRows([])
                    }}
                    sx={{ inlineSize: { xs: '100%', md: 210 } }}
                  >
                    <MenuItem value=''>All categories</MenuItem>
                    {categoryOptions.map(category => (
                      <MenuItem key={category.id} value={category.id}>
                        {`${'— '.repeat(category.depth)}${category.name}`}
                      </MenuItem>
                    ))}
                  </CustomTextField>
                </>
              }
            />
          }
          emptyState={{
            title: 'No articles loaded',
            description: 'Start building your knowledge base by creating your first article.'
          }}
          pagination={{
            page,
            rowsPerPage: pageSize,
            totalRows: totalCount,
            onPageChange: nextPage => {
              setPage(nextPage)
              setSelectedRows([])
            },
            onRowsPerPageChange: nextPageSize => {
              setPageSize(nextPageSize)
              setPage(0)
              setSelectedRows([])
            }
          }}
        />
      </Box>

      <KbArticleDialog
        open={dialogOpen}
        article={editingArticle}
        categories={categories}
        submitting={mutating}
        errors={dialogErrors}
        onClose={closeDialog}
        onSubmit={handleDialogSubmit}
      />

      <KbConfirmDialog
        open={Boolean(deleteTarget)}
        title='Delete article?'
        description={deleteTarget ? `Delete “${deleteTarget.title}”? This removes the article from active results.` : ''}
        confirmLabel='Delete'
        confirmColor='error'
        submitting={mutating}
        onClose={() => { if (!mutating) setDeleteTarget(undefined) }}
        onConfirm={() => void handleDelete()}
      />
    </KbPageShell>
  )
}

export default ArticlesDashboard
