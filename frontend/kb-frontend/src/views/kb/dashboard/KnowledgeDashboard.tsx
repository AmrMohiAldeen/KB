'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Eye,
  FileClock,
  FileText,
  Folder,
  Grid2X2,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import { KbEmptyState } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import type { ArticleFormState } from '../articles/components/KbArticleDialog'
import KbArticleDialog from '../articles/components/KbArticleDialog'
import type { CategoryFormState } from '../categories/utils/categoryForm'
import KbCategoryDialog from '../categories/components/KbCategoryDialog'
import DashboardCategoryTree from './DashboardCategoryTree'
import StatusChip from '../shared/components/StatusChip'
import type { ArticleListItemResponse } from '@/types/apps/articleTypes'
import type {
  DashboardArticleFilter,
  DashboardItem,
  DashboardPermissionContext,
  DashboardSort,
  DashboardView
} from '@/types/apps/dashboardTypes'
import type { KbCategoryNode } from '../types/categories'
import { articleStatusColor, articleStatusLabel } from '../config/articles'
import { formatDate } from '../shared/utils/formatDate'
import { getCategoryOptions } from '../categories/utils/categoryForm'
import { createArticle, deleteArticle, describeArticleApiError } from '@/lib/api/articlesApi'
import { createCategory, getCategoryTree } from '@/lib/api/categories'
import {
  defaultDashboardPageSize,
  getDashboardItems,
  getDashboardPermissionContext
} from '@/lib/api/dashboardApi'
import { describeApiError } from '@/lib/api/http'
import { canEditDashboardArticle, flattenDashboardCategories } from './utils/dashboardItems'
import { getLocalizedUrl } from '@/utils/i18n'

type KnowledgeDashboardProps = {
  accessToken: string
}

const missingTokenMessage = 'Sign in through the company authentication provider before loading the dashboard.'

const filterOptions: Array<{
  value: DashboardArticleFilter
  label: string
  icon: typeof FileText
}> = [
  { value: 'Everything', label: 'Everything', icon: FileText },
  { value: 'Published', label: 'Published', icon: Eye },
  { value: 'DraftUnpublished', label: 'Draft & Unpublished', icon: FileClock },
  { value: 'ToReview', label: 'To Review', icon: FileClock },
  { value: 'Archived', label: 'Archived', icon: Archive }
]

const sortOptions: Array<{ value: DashboardSort; label: string }> = [
  { value: 'position', label: 'Position' },
  { value: 'title', label: 'Title' },
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'createdAt', label: 'Date created' }
]

const hasPermission = (
  context: DashboardPermissionContext | null,
  permission: DashboardPermissionContext['permissions'][number]
) => Boolean(context?.permissions.includes(permission))

const ItemName = ({ item }: { item: DashboardItem }) => (
  <Stack direction='row' spacing={1.75} sx={{ alignItems: 'center', minInlineSize: 220 }}>
    <Box
      sx={theme => ({
        display: 'grid',
        placeItems: 'center',
        inlineSize: 34,
        blockSize: 34,
        borderRadius: 1.25,
        flexShrink: 0,
        bgcolor: item.kind === 'category'
          ? `rgba(${theme.vars.palette.warning.mainChannel} / 0.12)`
          : `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`,
        color: item.kind === 'category' ? 'warning.main' : 'primary.main'
      })}
    >
      {item.kind === 'category' ? <Folder size={18} /> : <FileText size={18} />}
    </Box>
    <Box sx={{ minInlineSize: 0 }}>
      <Typography color='text.primary' sx={{ fontWeight: 700, lineHeight: 1.35 }} noWrap>
        {item.kind === 'category' ? item.category.name : item.article.title}
      </Typography>
      <Typography variant='caption' color='text.secondary' noWrap sx={{ display: 'block', mt: 0.25 }}>
        {item.kind === 'category'
          ? `${item.category.articleCount} article${item.category.articleCount === 1 ? '' : 's'}`
          : `Updated ${formatDate(item.article.updatedAt)} · ${item.article.owner.fullName}`}
      </Typography>
    </Box>
  </Stack>
)

type DashboardFiltersProps = {
  activeFilter: DashboardArticleFilter
  categories: KbCategoryNode[]
  categoriesLoading: boolean
  categoryId: string
  filterCounts: Record<DashboardArticleFilter, number> | null
  onFilter: (filter: DashboardArticleFilter) => void
  onSelectCategory: (categoryId: string) => void
}

const DashboardFilters = ({
  activeFilter,
  categories,
  categoriesLoading,
  categoryId,
  filterCounts,
  onFilter,
  onSelectCategory
}: DashboardFiltersProps) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', blockSize: '100%', minBlockSize: 0 }}>
    <Box sx={{ px: 3, pt: 3, pb: 2.5 }}>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ display: 'block', mb: 1.25, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        Article status
      </Typography>
      <Stack spacing={0.5}>
        {filterOptions.map(option => {
          const Icon = option.icon
          const active = activeFilter === option.value
          const count = filterCounts?.[option.value]

          return (
            <Button
              key={option.value}
              fullWidth
              variant='text'
              color={active ? 'primary' : 'secondary'}
              onClick={() => onFilter(option.value)}
              startIcon={<Icon size={16} />}
              aria-pressed={active}
              sx={theme => ({
                justifyContent: 'flex-start',
                minBlockSize: 36,
                px: 1.5,
                borderRadius: 1.25,
                fontWeight: active ? 700 : 500,
                bgcolor: active ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)` : 'transparent',
                '&:hover': {
                  bgcolor: active
                    ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)`
                    : 'action.hover'
                }
              })}
            >
              <Box component='span' sx={{ flex: 1, minInlineSize: 0, textAlign: 'start' }}>{option.label}</Box>
              <Typography
                component='span'
                variant='caption'
                color='inherit'
                sx={{ fontVariantNumeric: 'tabular-nums', opacity: active ? 1 : 0.72 }}
              >
                {count ?? '—'}
              </Typography>
            </Button>
          )
        })}
      </Stack>
    </Box>

    <Divider />

    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 1.25 }}>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
      >
        Categories
      </Typography>
      {categoryId && (
        <Button size='small' onClick={() => onSelectCategory('')} sx={{ minInlineSize: 0, px: 1 }}>
          Clear
        </Button>
      )}
    </Box>
    <Box sx={{ flex: 1, minBlockSize: 0, overflowY: 'auto', px: 2, pb: 3 }}>
      <DashboardCategoryTree
        categories={categories}
        selectedCategoryId={categoryId}
        loading={categoriesLoading}
        onSelect={id => onSelectCategory(categoryId === id ? '' : id)}
      />
    </Box>
  </Box>
)

const KnowledgeDashboard = ({ accessToken }: KnowledgeDashboardProps) => {
  const router = useRouter()
  const theme = useTheme()
  const { lang } = useParams<{ lang: string }>()
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [items, setItems] = useState<DashboardItem[]>([])
  const [permissionContext, setPermissionContext] = useState<DashboardPermissionContext | null>(null)
  const [activeFilter, setActiveFilter] = useState<DashboardArticleFilter>('Everything')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<DashboardSort>('position')
  const [view, setView] = useState<DashboardView>('list')
  const [filterCounts, setFilterCounts] = useState<Record<DashboardArticleFilter, number> | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(defaultDashboardPageSize)
  const [totalCount, setTotalCount] = useState(0)
  const [categoriesLoading, setCategoriesLoading] = useState(Boolean(accessToken))
  const [contentLoading, setContentLoading] = useState(Boolean(accessToken))
  const [mutating, setMutating] = useState(false)
  const [pageErrors, setPageErrors] = useState<string[]>(accessToken ? [] : [missingTokenMessage])
  const [mutationErrors, setMutationErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [articleDialogOpen, setArticleDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItemResponse>()
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(() => new Set())
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<HTMLElement | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setContentLoading(true)
      setPage(0)
      setSelectedArticleIds(new Set())
      setDebouncedSearch(search.trim())
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()

    if (!accessToken) return () => controller.abort()

    Promise.allSettled([
      getCategoryTree(accessToken, controller.signal),
      getDashboardPermissionContext(accessToken, controller.signal)
    ]).then(([categoryResult, permissionResult]) => {
      if (controller.signal.aborted) return

      if (categoryResult.status === 'fulfilled') {
        setCategories(categoryResult.value)
      } else if (!(categoryResult.reason instanceof DOMException && categoryResult.reason.name === 'AbortError')) {
        setCategories([])
        setPageErrors(current => [...current, ...describeApiError(categoryResult.reason)])
      }

      if (permissionResult.status === 'fulfilled') {
        setPermissionContext(permissionResult.value)
      } else if (!(permissionResult.reason instanceof DOMException && permissionResult.reason.name === 'AbortError')) {
        setPermissionContext(null)
        setPageErrors(current => [...current, 'Dashboard actions could not be authorized and are hidden.'])
      }

      setCategoriesLoading(false)
    })

    return () => controller.abort()
  }, [accessToken, refreshKey])

  useEffect(() => {
    const controller = new AbortController()

    if (!accessToken) return () => controller.abort()

    getDashboardItems({
      accessToken,
      filter: activeFilter,
      search: debouncedSearch || undefined,
      categoryId: categoryId || undefined,
      sort,
      page: page + 1,
      pageSize,
      signal: controller.signal
    }).then(result => {
      if (controller.signal.aborted) return

      setItems(result.items)
      setFilterCounts(result.filterCounts)
      setTotalCount(result.totalCount)
      setPageErrors([])
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return

      setItems([])
      setFilterCounts(null)
      setTotalCount(0)
      setPageErrors(describeArticleApiError(error))
    }).finally(() => {
      if (!controller.signal.aborted) setContentLoading(false)
    })

    return () => controller.abort()
  }, [accessToken, activeFilter, categoryId, debouncedSearch, page, pageSize, refreshKey, sort])

  const categoryOptions = useMemo(() => getCategoryOptions(categories), [categories])
  const selectedCategory = useMemo(
    () => flattenDashboardCategories(categories).find(category => category.id === categoryId),
    [categories, categoryId]
  )
  const canCreateArticle = hasPermission(permissionContext, 'articles.create')
  const canManageCategories = hasPermission(permissionContext, 'categories.manage')
  const canDeleteArticle = hasPermission(permissionContext, 'articles.delete')
  const canViewArticles = hasPermission(permissionContext, 'articles.view')
  const selectableArticles = useMemo(
    () => items.flatMap(item => item.kind === 'article' && item.article.status !== 'Archived' && canDeleteArticle
      ? [item.article]
      : []),
    [canDeleteArticle, items]
  )
  const selectedArticles = useMemo(
    () => selectableArticles.filter(article => selectedArticleIds.has(article.articleId)),
    [selectableArticles, selectedArticleIds]
  )
  const allArticlesSelected = selectableArticles.length > 0 && selectedArticles.length === selectableArticles.length

  const applyFilter = (filter: DashboardArticleFilter) => {
    setContentLoading(true)
    setPage(0)
    setActiveFilter(filter)
    setSelectedArticleIds(new Set())
    setMutationErrors([])
  }

  const selectCategory = (nextCategoryId: string) => {
    setContentLoading(true)
    setPage(0)
    setCategoryId(nextCategoryId)
    setSelectedArticleIds(new Set())
    setFilterDrawerOpen(false)
  }

  const refresh = useCallback(() => {
    setCategoriesLoading(true)
    setContentLoading(true)
    setRefreshKey(current => current + 1)
  }, [])

  const submitArticle = useCallback(async (form: ArticleFormState) => {
    if (!accessToken || !canCreateArticle || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      await createArticle(form, accessToken)
      setArticleDialogOpen(false)
      setSuccessMessage(`“${form.title}” was created.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeArticleApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, canCreateArticle, mutating, refresh])

  const submitCategory = useCallback(async (form: CategoryFormState) => {
    if (!accessToken || !canManageCategories || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      await createCategory({
        name: form.name,
        description: form.description || null,
        parentCategoryId: form.parentCategoryId || null,
        sortOrder: form.sortOrder
      }, accessToken)
      setCategoryDialogOpen(false)
      setSuccessMessage(`“${form.name}” was created.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, canManageCategories, mutating, refresh])

  const confirmDelete = useCallback(async () => {
    if (!accessToken || !canDeleteArticle || !deleteTarget || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      await deleteArticle(deleteTarget.articleId, accessToken)
      setSuccessMessage(`“${deleteTarget.title}” was deleted.`)
      setDeleteTarget(undefined)
      refresh()
    } catch (error) {
      setMutationErrors(describeArticleApiError(error))
    } finally {
      setMutating(false)
    }
  }, [accessToken, canDeleteArticle, deleteTarget, mutating, refresh])

  const confirmBulkDelete = useCallback(async () => {
    if (!accessToken || !canDeleteArticle || !selectedArticles.length || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      const results = await Promise.allSettled(
        selectedArticles.map(article => deleteArticle(article.articleId, accessToken))
      )
      const failedCount = results.filter(result => result.status === 'rejected').length
      const deletedCount = results.length - failedCount

      if (deletedCount > 0)
        setSuccessMessage(`${deletedCount} article${deletedCount === 1 ? '' : 's'} deleted.`)

      if (failedCount > 0) {
        setMutationErrors([
          `${failedCount} article${failedCount === 1 ? '' : 's'} could not be deleted. Refresh and try again.`
        ])
      }

      setSelectedArticleIds(new Set())
      setBulkDeleteOpen(false)
      refresh()
    } finally {
      setMutating(false)
    }
  }, [accessToken, canDeleteArticle, mutating, refresh, selectedArticles])

  const toggleArticle = (articleId: string) => {
    setSelectedArticleIds(current => {
      const next = new Set(current)

      if (next.has(articleId)) next.delete(articleId)
      else next.add(articleId)

      return next
    })
  }

  const toggleAllArticles = () => {
    setSelectedArticleIds(allArticlesSelected
      ? new Set()
      : new Set(selectableArticles.map(article => article.articleId)))
  }

  const articleActions = (article: ArticleListItemResponse) => {
    const canEdit = canEditDashboardArticle({ article, permissionContext })
    const canView = canViewArticles && article.status !== 'Archived'
    const canDelete = canDeleteArticle && article.status !== 'Archived'

    if (!canView && !canEdit && !canDelete)
      return <Typography variant='body2' color='text.secondary'>—</Typography>

    return (
      <Stack direction='row' spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
        {canView && (
          <Tooltip title='View article'>
            <IconButton
              size='small'
              onClick={() => router.push(getLocalizedUrl(`/kb/${article.slug}`, lang))}
              aria-label={`View ${article.title}`}
            >
              <Eye size={16} />
            </IconButton>
          </Tooltip>
        )}
        {canEdit && (
          <Tooltip title='Open editor'>
            <IconButton
              size='small'
              color='primary'
              onClick={() => router.push(getLocalizedUrl(`/editor?articleId=${encodeURIComponent(article.articleId)}`, lang))}
              aria-label={`Edit ${article.title}`}
            >
              <Pencil size={16} />
            </IconButton>
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip title='Delete article'>
            <IconButton
              size='small'
              color='error'
              disabled={mutating}
              onClick={() => setDeleteTarget(article)}
              aria-label={`Delete ${article.title}`}
            >
              <Trash2 size={16} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    )
  }

  const emptyState = activeFilter === 'Archived'
    ? {
        title: 'No archived articles',
        description: 'Archived articles will appear here when they are removed from active content.'
      }
    : debouncedSearch
      ? {
          title: 'No search results',
          description: `No article or category names match “${debouncedSearch}”.`
        }
      : {
          title: categoryId ? 'This category is empty' : 'Nothing to show',
          description: categoryId
            ? 'This category has no child categories or articles matching the current status filter.'
            : activeFilter !== 'Everything'
              ? 'No categories or articles match the selected filter.'
              : 'Create a category or article when content is ready to be added.'
        }

  const filters = (
    <DashboardFilters
      activeFilter={activeFilter}
      categories={categories}
      categoriesLoading={categoriesLoading}
      categoryId={categoryId}
      filterCounts={filterCounts}
      onFilter={applyFilter}
      onSelectCategory={selectCategory}
    />
  )

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          minBlockSize: 'calc(100dvh - var(--header-height, 64px))',
          mx: { xs: -2.5, md: -4 },
          my: { xs: -2.5, md: -4 },
          bgcolor: 'background.default'
        }}
      >
        <Box
          component='aside'
          aria-label='Dashboard navigation and article filters'
          sx={{
            display: { xs: 'none', lg: 'block' },
            position: 'sticky',
            top: 'var(--header-height, 64px)',
            inlineSize: 272,
            blockSize: 'calc(100dvh - var(--header-height, 64px))',
            flexShrink: 0,
            alignSelf: 'flex-start',
            overflow: 'hidden',
            borderInlineEnd: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          {filters}
        </Box>

        <Drawer
          anchor={theme.direction === 'rtl' ? 'right' : 'left'}
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          slotProps={{ paper: { sx: { inlineSize: 288 } } }}
        >
          <DashboardFilters
            activeFilter={activeFilter}
            categories={categories}
            categoriesLoading={categoriesLoading}
            categoryId={categoryId}
            filterCounts={filterCounts}
            onFilter={filter => {
              applyFilter(filter)
              setFilterDrawerOpen(false)
            }}
            onSelectCategory={selectCategory}
          />
        </Drawer>

        <Box component='main' sx={{ flex: 1, minInlineSize: 0 }}>
          <Box
            component='header'
            sx={{
              px: { xs: 2.5, sm: 3.5, xl: 4.5 },
              py: { xs: 2.5, md: 3 },
              borderBlockEnd: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Breadcrumbs separator={<ChevronRight size={13} />} aria-label='Breadcrumbs' sx={{ mb: 1 }}>
              <Typography variant='caption' color='text.secondary'>Knowledge base</Typography>
              <Typography variant='caption' color='text.secondary'>Dashboard</Typography>
              {selectedCategory && <Typography variant='caption' color='text.primary'>{selectedCategory.name}</Typography>}
            </Breadcrumbs>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minInlineSize: 0 }}>
                <Typography variant='h5' sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {selectedCategory?.name ?? 'Dashboard'}
                </Typography>
                <Typography variant='body2' color='text.secondary' sx={{ mt: 0.25 }} noWrap>
                  {selectedCategory
                    ? selectedCategory.path || 'Child categories and articles'
                    : 'Manage knowledge base categories and articles'}
                </Typography>
              </Box>
              {(canManageCategories || canCreateArticle) && (
                <Stack direction='row' spacing={1.25} sx={{ flexShrink: 0 }}>
                  {canManageCategories && (
                    <Button
                      size='small'
                      variant='outlined'
                      startIcon={<Plus size={16} />}
                      disabled={mutating}
                      onClick={() => {
                        setMutationErrors([])
                        setCategoryDialogOpen(true)
                      }}
                    >
                      New Category
                    </Button>
                  )}
                  {canCreateArticle && (
                    <Button
                      size='small'
                      variant='contained'
                      startIcon={<Plus size={16} />}
                      disabled={mutating || !categories.length}
                      onClick={() => {
                        setMutationErrors([])
                        setArticleDialogOpen(true)
                      }}
                    >
                      New Article
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          </Box>

          {(pageErrors.length > 0 || mutationErrors.length > 0 || successMessage) && (
            <Stack spacing={1.5} sx={{ px: { xs: 2.5, sm: 3.5, xl: 4.5 }, pt: 2.5 }}>
              <KbValidationSummary
                title='Dashboard could not be loaded or changed'
                errors={[...pageErrors, ...mutationErrors]}
              />
              {pageErrors.length > 0 && (
                <Button
                  size='small'
                  variant='outlined'
                  startIcon={<RotateCcw size={15} />}
                  onClick={refresh}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Try again
                </Button>
              )}
              {successMessage && (
                <Alert severity='success' onClose={() => setSuccessMessage('')}>{successMessage}</Alert>
              )}
            </Stack>
          )}

          <Box
            role='toolbar'
            aria-label='Content controls'
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              flexWrap: 'wrap',
              px: { xs: 2.5, sm: 3.5, xl: 4.5 },
              py: 2,
              borderBlockEnd: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper'
            }}
          >
            <Button
              size='small'
              variant='outlined'
              color='secondary'
              startIcon={<SlidersHorizontal size={15} />}
              onClick={() => setFilterDrawerOpen(true)}
              sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
            >
              Filters
            </Button>

            <Button
              size='small'
              variant='outlined'
              color='secondary'
              endIcon={<ChevronDown size={15} />}
              disabled={!selectedArticles.length || mutating}
              onClick={event => setBulkMenuAnchor(event.currentTarget)}
              aria-haspopup='menu'
              aria-expanded={Boolean(bulkMenuAnchor)}
            >
              Bulk actions{selectedArticles.length ? ` (${selectedArticles.length})` : ''}
            </Button>
            <Menu
              anchorEl={bulkMenuAnchor}
              open={Boolean(bulkMenuAnchor)}
              onClose={() => setBulkMenuAnchor(null)}
            >
              <MenuItem
                onClick={() => {
                  setBulkMenuAnchor(null)
                  setBulkDeleteOpen(true)
                }}
              >
                <Trash2 size={16} style={{ marginInlineEnd: 10 }} />
                Delete selected
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setBulkMenuAnchor(null)
                  setSelectedArticleIds(new Set())
                }}
              >
                Clear selection
              </MenuItem>
            </Menu>

            <CustomTextField
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search articles and categories'
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search size={16} aria-hidden='true' />
                    </InputAdornment>
                  )
                },
                htmlInput: { 'aria-label': 'Search articles and categories' }
              }}
              sx={{ flex: '1 1 240px', minInlineSize: 180, maxInlineSize: 480 }}
            />

            <CustomTextField
              select
              value={activeFilter}
              onChange={event => applyFilter(event.target.value as DashboardArticleFilter)}
              slotProps={{ htmlInput: { 'aria-label': 'Filter by article status' } }}
              sx={{ display: { xs: 'none', sm: 'block' }, minInlineSize: 160 }}
            >
              {filterOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </CustomTextField>

            <CustomTextField
              select
              value={categoryId}
              onChange={event => selectCategory(event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Filter by category' } }}
              sx={{ display: { xs: 'none', xl: 'block' }, minInlineSize: 175 }}
            >
              <MenuItem value=''>All categories</MenuItem>
              {categoryOptions.map(category => (
                <MenuItem key={category.id} value={category.id}>
                  {`${'— '.repeat(category.depth)}${category.name}`}
                </MenuItem>
              ))}
            </CustomTextField>

            <CustomTextField
              select
              value={sort}
              onChange={event => {
                setContentLoading(true)
                setPage(0)
                setSelectedArticleIds(new Set())
                setSort(event.target.value as DashboardSort)
              }}
              slotProps={{ htmlInput: { 'aria-label': 'Sort content' } }}
              sx={{ minInlineSize: 150 }}
            >
              {sortOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </CustomTextField>

            <ButtonGroup size='small' variant='outlined' aria-label='Dashboard view'>
              <Tooltip title='List view'>
                <IconButton
                  color={view === 'list' ? 'primary' : 'secondary'}
                  onClick={() => setView('list')}
                  aria-label='List view'
                  aria-pressed={view === 'list'}
                >
                  <List size={17} />
                </IconButton>
              </Tooltip>
              <Tooltip title='Grid view'>
                <IconButton
                  color={view === 'grid' ? 'primary' : 'secondary'}
                  onClick={() => setView('grid')}
                  aria-label='Grid view'
                  aria-pressed={view === 'grid'}
                >
                  <Grid2X2 size={17} />
                </IconButton>
              </Tooltip>
            </ButtonGroup>

            <Typography
              variant='caption'
              color='text.secondary'
              aria-live='polite'
              sx={{ ml: { xl: 'auto' }, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {contentLoading
                ? 'Loading…'
                : totalCount === 0
                  ? 'No matching items'
                  : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)} of ${totalCount}`}
            </Typography>

            {(search || categoryId || activeFilter !== 'Everything') && (
              <Button
                size='small'
                onClick={() => {
                  setSearch('')
                  setActiveFilter('Everything')
                  selectCategory('')
                }}
              >
                Clear
              </Button>
            )}
          </Box>

          <Box sx={{ bgcolor: 'background.paper', minBlockSize: 420 }}>
            {contentLoading ? (
              <TableContainer aria-label='Loading dashboard content'>
                <Table sx={{ minInlineSize: { xs: 620, md: 840 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell padding='checkbox'><Skeleton variant='rounded' width={18} height={18} /></TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Category</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align='right'>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[1, 2, 3, 4, 5, 6].map(row => (
                      <TableRow key={row}>
                        <TableCell padding='checkbox'><Skeleton variant='rounded' width={18} height={18} /></TableCell>
                        <TableCell>
                          <Stack direction='row' spacing={1.75} sx={{ alignItems: 'center' }}>
                            <Skeleton variant='rounded' width={34} height={34} />
                            <Box sx={{ flex: 1 }}>
                              <Skeleton width={`${42 + row * 5}%`} />
                              <Skeleton width={`${28 + row * 2}%`} />
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}><Skeleton width={100} /></TableCell>
                        <TableCell><Skeleton variant='rounded' width={76} height={24} /></TableCell>
                        <TableCell align='right'><Skeleton width={68} sx={{ ml: 'auto' }} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : items.length === 0 ? (
              <Box sx={{ p: { xs: 4, md: 7 } }}>
                <KbEmptyState
                  title={emptyState.title}
                  description={emptyState.description}
                  icon={activeFilter === 'Archived' ? <Archive /> : <Search />}
                  action={debouncedSearch ? (
                    <Button variant='outlined' onClick={() => setSearch('')}>Clear search</Button>
                  ) : undefined}
                />
              </Box>
            ) : view === 'list' ? (
              <TableContainer>
                <Table aria-label='Categories and articles' sx={{ minInlineSize: { xs: 620, md: 840 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell padding='checkbox'>
                        <Checkbox
                          size='small'
                          checked={allArticlesSelected}
                          indeterminate={selectedArticles.length > 0 && !allArticlesSelected}
                          disabled={!selectableArticles.length}
                          onChange={toggleAllArticles}
                          slotProps={{ input: { 'aria-label': 'Select all deletable articles on this page' } }}
                        />
                      </TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Category</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align='right'>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map(item => {
                      const isArticle = item.kind === 'article'
                      const selectable = isArticle && canDeleteArticle && item.article.status !== 'Archived'
                      const selected = isArticle && selectedArticleIds.has(item.article.articleId)

                      return (
                        <TableRow
                          key={item.id}
                          selected={selected}
                          sx={{
                            '& > *': { borderBlockEndColor: 'divider' },
                            '&:hover': { bgcolor: 'action.hover' },
                            '&.Mui-selected': { bgcolor: 'action.selected' }
                          }}
                        >
                          <TableCell padding='checkbox'>
                            {isArticle ? (
                              <Checkbox
                                size='small'
                                checked={selected}
                                disabled={!selectable}
                                onChange={() => toggleArticle(item.article.articleId)}
                                slotProps={{ input: { 'aria-label': `Select ${item.article.title}` } }}
                              />
                            ) : <Box sx={{ inlineSize: 34 }} />}
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}><ItemName item={item} /></TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                            {item.kind === 'category'
                              ? item.category.path || 'Top level'
                              : item.article.category?.name ?? 'Uncategorized'}
                          </TableCell>
                          <TableCell>
                            {item.kind === 'category' ? (
                              <Chip size='small' label='Category' variant='outlined' color='warning' />
                            ) : (
                              <StatusChip
                                label={articleStatusLabel[item.article.status]}
                                color={articleStatusColor[item.article.status]}
                              />
                            )}
                          </TableCell>
                          <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                            {item.kind === 'category' ? (
                              <Button size='small' onClick={() => selectCategory(item.category.id)}>Browse</Button>
                            ) : articleActions(item.article)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))',
                  gap: 2,
                  p: { xs: 2.5, sm: 3.5, xl: 4.5 }
                }}
              >
                {items.map(item => {
                  const isArticle = item.kind === 'article'
                  const selectable = isArticle && canDeleteArticle && item.article.status !== 'Archived'
                  const selected = isArticle && selectedArticleIds.has(item.article.articleId)

                  return (
                    <Box
                      key={item.id}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        minBlockSize: 168,
                        p: 2.25,
                        border: 1,
                        borderColor: selected ? 'primary.main' : 'divider',
                        borderRadius: 1.5,
                        bgcolor: selected ? 'action.selected' : 'background.paper',
                        transition: theme.transitions.create(['border-color', 'background-color', 'box-shadow']),
                        '&:hover': { borderColor: 'text.disabled', boxShadow: theme.shadows[2] }
                      }}
                    >
                      <Stack direction='row' sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                        {isArticle ? (
                          <Checkbox
                            size='small'
                            checked={selected}
                            disabled={!selectable}
                            onChange={() => toggleArticle(item.article.articleId)}
                            slotProps={{ input: { 'aria-label': `Select ${item.article.title}` } }}
                            sx={{ p: 0.5, ml: -0.5 }}
                          />
                        ) : <Box />}
                        {item.kind === 'category' ? (
                          <Chip size='small' label='Category' variant='outlined' color='warning' />
                        ) : (
                          <StatusChip
                            label={articleStatusLabel[item.article.status]}
                            color={articleStatusColor[item.article.status]}
                          />
                        )}
                      </Stack>
                      <ItemName item={item} />
                      <Typography variant='caption' color='text.secondary' noWrap sx={{ mt: 1.5 }}>
                        {item.kind === 'category'
                          ? item.category.path || 'Top-level category'
                          : item.article.category?.name ?? 'Uncategorized'}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      <Divider sx={{ my: 1.75 }} />
                      {item.kind === 'category' ? (
                        <Button size='small' onClick={() => selectCategory(item.category.id)} sx={{ alignSelf: 'flex-end' }}>
                          Browse
                        </Button>
                      ) : articleActions(item.article)}
                    </Box>
                  )
                })}
              </Box>
            )}

            {!contentLoading && totalCount > 0 && (
              <>
                <Divider />
                <TablePagination
                  component='div'
                  count={totalCount}
                  page={page}
                  rowsPerPage={pageSize}
                  rowsPerPageOptions={[25, 50, 100]}
                  onPageChange={(_, nextPage) => {
                    setContentLoading(true)
                    setSelectedArticleIds(new Set())
                    setPage(nextPage)
                  }}
                  onRowsPerPageChange={event => {
                    setContentLoading(true)
                    setSelectedArticleIds(new Set())
                    setPage(0)
                    setPageSize(Number(event.target.value))
                  }}
                  labelRowsPerPage='Items per page'
                />
              </>
            )}
          </Box>
        </Box>
      </Box>

      <KbCategoryDialog
        open={categoryDialogOpen}
        categories={categories}
        submitting={mutating}
        errors={mutationErrors}
        onClose={() => { if (!mutating) setCategoryDialogOpen(false) }}
        onSubmit={submitCategory}
      />
      <KbArticleDialog
        open={articleDialogOpen}
        categories={categories}
        submitting={mutating}
        errors={mutationErrors}
        onClose={() => { if (!mutating) setArticleDialogOpen(false) }}
        onSubmit={submitArticle}
      />
      <KbConfirmDialog
        open={Boolean(deleteTarget)}
        title='Delete article?'
        description={deleteTarget ? `Delete “${deleteTarget.title}”? This removes the article from active results.` : ''}
        confirmLabel='Delete'
        confirmColor='error'
        submitting={mutating}
        onClose={() => { if (!mutating) setDeleteTarget(undefined) }}
        onConfirm={() => void confirmDelete()}
      />
      <KbConfirmDialog
        open={bulkDeleteOpen}
        title='Delete selected articles?'
        description={`Delete ${selectedArticles.length} selected article${selectedArticles.length === 1 ? '' : 's'}? This removes them from active results.`}
        confirmLabel='Delete selected'
        confirmColor='error'
        submitting={mutating}
        onClose={() => { if (!mutating) setBulkDeleteOpen(false) }}
        onConfirm={() => void confirmBulkDelete()}
      />
    </>
  )
}

export default KnowledgeDashboard
