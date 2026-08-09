'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Checkbox from '@mui/material/Checkbox'
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
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileCode2,
  FileClock,
  FileText,
  Folder,
  Grid2X2,
  GripVertical,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound
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
import type { ArticleDetailsResponse, ArticleListItemResponse } from '@/types/apps/articleTypes'
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
import {
  createArticle,
  deleteArticle,
  describeArticleApiError,
  getArticleById,
  updateArticle
} from '@/lib/api/articlesApi'
import { describeLifecycleError, unarchiveArticle } from '@/lib/api/articleLifecycleApi'
import { getArticleDraft, saveArticleDraftContent } from '@/lib/api/articleDraftsApi'
import {
  archiveCategory,
  createCategory,
  deleteCategory,
  getCategoryTree,
  moveCategory,
  unarchiveCategory,
  updateCategory
} from '@/lib/api/categories'
import {
  defaultDashboardPageSize,
  getDashboardItems,
  getDashboardPermissionContext,
  reorderDashboardItem
} from '@/lib/api/dashboardApi'
import { describeApiError } from '@/lib/api/http'
import {
  canEditDashboardArticle,
  flattenDashboardCategories,
  reorderDashboardItems
} from './utils/dashboardItems'
import { getLocalizedUrl } from '@/utils/i18n'

type KnowledgeDashboardProps = {
  accessToken: string
  initialCategoryId?: string
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
          : `Updated ${formatDate(item.article.updatedAt)}`}
      </Typography>
    </Box>
  </Stack>
)

const ArticleBadges = ({ article }: { article: ArticleListItemResponse }) => {
  const statuses = article.currentDraftId && article.status !== 'Draft'
    ? (['Draft', article.status] as const)
    : [article.status]

  return (
    <Stack direction='row' spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {statuses.map(status => (
        <StatusChip
          key={status}
          label={articleStatusLabel[status]}
          color={articleStatusColor[status]}
        />
      ))}
    </Stack>
  )
}

const stopRowAction = (event: SyntheticEvent) => event.stopPropagation()

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

const KnowledgeDashboard = ({ accessToken, initialCategoryId = '' }: KnowledgeDashboardProps) => {
  const theme = useTheme()
  const router = useRouter()
  const { lang } = useParams<{ lang: string }>()
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [items, setItems] = useState<DashboardItem[]>([])
  const [permissionContext, setPermissionContext] = useState<DashboardPermissionContext | null>(null)
  const [activeFilter, setActiveFilter] = useState<DashboardArticleFilter>('Everything')
  const [categoryId, setCategoryId] = useState(initialCategoryId)
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
  const [editingCategory, setEditingCategory] = useState<KbCategoryNode>()
  const [editingArticle, setEditingArticle] = useState<ArticleDetailsResponse>()
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItemResponse>()
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<KbCategoryNode>()
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(() => new Set())
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<HTMLElement | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [draggedItemId, setDraggedItemId] = useState<string>()
  const [dropTarget, setDropTarget] = useState<{ id: string; placement: 'before' | 'after' }>()
  const [reordering, setReordering] = useState(false)
  const suppressNavigationRef = useRef(false)

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
  const canEditOwnArticle = hasPermission(permissionContext, 'articles.editOwnDraft') ||
    hasPermission(permissionContext, 'articles.editAnyDraft')
  const canReorderArticles = hasPermission(permissionContext, 'articles.editAnyDraft')
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

  const canReorderItem = (item: DashboardItem) => sort === 'position' && !debouncedSearch && (
    item.kind === 'category'
      ? canManageCategories
      : canReorderArticles && Boolean(categoryId)
  )

  const finishDragging = () => {
    setDraggedItemId(undefined)
    setDropTarget(undefined)
    window.setTimeout(() => { suppressNavigationRef.current = false }, 0)
  }

  const persistReorder = async (
    draggedId: string,
    targetId: string,
    placement: 'before' | 'after'
  ) => {
    const dragged = items.find(item => item.id === draggedId)
    const target = items.find(item => item.id === targetId)

    if (!dragged || !target || dragged.kind !== target.kind || !canReorderItem(dragged)) return

    const previousItems = items

    setItems(reorderDashboardItems(items, draggedId, targetId, placement))
    setReordering(true)
    setMutationErrors([])
    try {
      await reorderDashboardItem({
        accessToken,
        kind: dragged.kind,
        id: dragged.kind === 'category' ? dragged.category.id : dragged.article.articleId,
        targetId: target.kind === 'category' ? target.category.id : target.article.articleId,
        placement
      })
      if (dragged.kind === 'category') {
        const tree = await getCategoryTree(accessToken)

        setCategories(tree)
      }
    } catch (error) {
      setItems(previousItems)
      setMutationErrors(describeApiError(error))
    } finally {
      setReordering(false)
      finishDragging()
    }
  }

  const moveWithKeyboard = (item: DashboardItem, direction: -1 | 1) => {
    const group = items.filter(candidate => candidate.kind === item.kind)
    const index = group.findIndex(candidate => candidate.id === item.id)
    const target = group[index + direction]

    if (!target) return
    suppressNavigationRef.current = true
    void persistReorder(item.id, target.id, direction < 0 ? 'before' : 'after')
  }

  const dragHandle = (item: DashboardItem) => {
    if (!canReorderItem(item)) return null

    const label = item.kind === 'category' ? item.category.name : item.article.title

    return (
      <Tooltip title='Drag to reorder'>
        <IconButton
          className='dashboard-drag-handle'
          size='small'
          draggable={!reordering}
          disabled={reordering}
          onClick={stopRowAction}
          onMouseDown={stopRowAction}
          onDragStart={event => {
            stopRowAction(event)
            suppressNavigationRef.current = true
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', item.id)
            setDraggedItemId(item.id)
          }}
          onDragEnd={finishDragging}
          onKeyDown={event => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
              event.preventDefault()
              stopRowAction(event)
              moveWithKeyboard(item, -1)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
              event.preventDefault()
              stopRowAction(event)
              moveWithKeyboard(item, 1)
            }
          }}
          aria-label={`Reorder ${label}`}
          sx={{
            cursor: reordering ? 'wait' : 'grab',
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 140ms ease, color 140ms ease',
            '&:active': { cursor: 'grabbing' },
            '&:focus-visible': { opacity: 1 }
          }}
        >
          <GripVertical size={17} />
        </IconButton>
      </Tooltip>
    )
  }

  const dragOverItem = (event: ReactDragEvent<HTMLElement>, item: DashboardItem) => {
    const dragged = items.find(candidate => candidate.id === draggedItemId)

    if (!dragged || dragged.id === item.id || dragged.kind !== item.kind || !canReorderItem(dragged)) return

    event.preventDefault()
    stopRowAction(event)
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'

    if (dropTarget?.id !== item.id || dropTarget.placement !== placement)
      setDropTarget({ id: item.id, placement })
  }

  const leaveDragTarget = (event: ReactDragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return

    setDropTarget(undefined)
  }

  const dropOnItem = (event: ReactDragEvent<HTMLElement>, item: DashboardItem) => {
    event.preventDefault()
    stopRowAction(event)
    const sourceId = draggedItemId ?? event.dataTransfer.getData('text/plain')

    if (sourceId && dropTarget?.id === item.id)
      void persistReorder(sourceId, item.id, dropTarget.placement)
    else finishDragging()
  }

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
    const url = new URL(window.location.href)

    if (nextCategoryId) url.searchParams.set('categoryId', nextCategoryId)
    else url.searchParams.delete('categoryId')
    window.history.replaceState(null, '', url)
    setSelectedArticleIds(new Set())
    setFilterDrawerOpen(false)
  }

  const openDashboardItem = (item: DashboardItem) => {
    if (suppressNavigationRef.current) return

    if (item.kind === 'category') {
      selectCategory(item.category.id)
      return
    }

    router.push(getLocalizedUrl(`/editor?articleId=${encodeURIComponent(item.article.articleId)}`, lang))
  }

  const openDashboardItemFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>, item: DashboardItem) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return

    event.preventDefault()
    openDashboardItem(item)
  }

  const refresh = () => {
    setCategoriesLoading(true)
    setContentLoading(true)
    setRefreshKey(current => current + 1)
  }

  const submitArticle = async (form: ArticleFormState) => {
    const canEdit = editingArticle && canEditDashboardArticle({
      article: {
        ...editingArticle,
        currentDraftId: editingArticle.currentDraft?.draftId ?? null,
        currentPublishedVersionId: editingArticle.currentPublishedVersion?.versionId ?? null,
        isCurrentDraftLocked: editingArticle.currentDraft?.isLocked ?? false,
        lockedBy: editingArticle.currentDraft?.lockedBy ?? null,
        position: 0
      },
      permissionContext
    })

    if (!accessToken || mutating || (!editingArticle && !canCreateArticle) || (editingArticle && !canEdit)) return

    setMutating(true)
    setMutationErrors([])

    try {
      if (editingArticle) {
        const rowVersion = editingArticle.currentDraft?.rowVersion

        if (!rowVersion) {
          setMutationErrors(['This article has no editable draft metadata. Open it in the editor to create a draft.'])
          return
        }
        await updateArticle(editingArticle.articleId, { ...form, rowVersion }, accessToken)
      } else {
        await createArticle(form, accessToken)
      }
      setArticleDialogOpen(false)
      setEditingArticle(undefined)
      setSuccessMessage(`“${form.title}” was ${editingArticle ? 'updated' : 'created'}.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeArticleApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const submitCategory = async (form: CategoryFormState) => {
    if (!accessToken || !canManageCategories || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: form.name,
          slug: form.slug,
          description: form.description || null,
          sortOrder: form.sortOrder
        }, accessToken)
        if ((editingCategory.parentId ?? '') !== form.parentCategoryId) {
          await moveCategory(editingCategory.id, {
            parentCategoryId: form.parentCategoryId || null,
            sortOrder: form.sortOrder
          }, accessToken)
        }
      } else {
        await createCategory({
          name: form.name,
          slug: form.slug || null,
          description: form.description || null,
          parentCategoryId: form.parentCategoryId || null,
          sortOrder: form.sortOrder
        }, accessToken)
      }
      setCategoryDialogOpen(false)
      setEditingCategory(undefined)
      setSuccessMessage(`“${form.name}” was ${editingCategory ? 'updated' : 'created'}.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const confirmDelete = async () => {
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
  }

  const confirmCategoryDelete = async () => {
    if (!accessToken || !canManageCategories || !categoryDeleteTarget || mutating) return

    setMutating(true)
    setMutationErrors([])
    try {
      await deleteCategory(categoryDeleteTarget.id, accessToken)
      setSuccessMessage(`“${categoryDeleteTarget.name}” was deleted.`)
      setCategoryDeleteTarget(undefined)
      if (categoryId === categoryDeleteTarget.id) selectCategory('')
      refresh()
    } catch (error) {
      setMutationErrors(describeApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const openArticleEdit = async (article: ArticleListItemResponse) => {
    if (!accessToken || mutating || !canEditDashboardArticle({ article, permissionContext })) return

    setMutating(true)
    setMutationErrors([])
    try {
      const details = await getArticleById(article.articleId, accessToken)

      setEditingArticle(details)
      setArticleDialogOpen(true)
    } catch (error) {
      setMutationErrors(describeArticleApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const duplicateItem = async (item: DashboardItem) => {
    if (!accessToken || mutating) return
    if (item.kind === 'category' && !canManageCategories) return
    if (item.kind === 'article' && (!canCreateArticle || !canEditOwnArticle)) return

    setMutating(true)
    setMutationErrors([])
    try {
      if (item.kind === 'category') {
        await createCategory({
          name: `${item.category.name} copy`,
          slug: null,
          description: item.category.description || null,
          parentCategoryId: item.category.parentId,
          sortOrder: item.category.sortOrder + 1
        }, accessToken)
      } else if (item.article.category) {
        const sourceDraft = await getArticleDraft(item.article.articleId, accessToken)
        const created = await createArticle({
          title: `${item.article.title} copy`,
          slug: null,
          categoryId: item.article.category.categoryId
        }, accessToken)
        const rowVersion = created.currentDraft?.rowVersion

        if (!rowVersion) throw new Error('The duplicate article draft could not be initialized.')
        await saveArticleDraftContent(created.articleId, {
          content: sourceDraft.content,
          rowVersion
        }, accessToken)
      } else {
        throw new Error('The article must belong to a category before it can be duplicated.')
      }
      setSuccessMessage(`“${item.kind === 'category' ? item.category.name : item.article.title}” was duplicated.`)
      refresh()
    } catch (error) {
      setMutationErrors(item.kind === 'article' ? describeArticleApiError(error) : describeApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const copyItemLink = async (item: DashboardItem) => {
    const path = item.kind === 'category'
      ? getLocalizedUrl(`/dashboard?categoryId=${encodeURIComponent(item.category.id)}`, lang)
      : getLocalizedUrl(`/kb/${encodeURIComponent(item.article.slug)}`, lang)

    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString())
      setSuccessMessage('Link copied to the clipboard.')
    } catch {
      setMutationErrors(['The link could not be copied. Check browser clipboard permissions and try again.'])
    }
  }

  const setCategoryArchived = async (category: KbCategoryNode) => {
    if (!accessToken || !canManageCategories || mutating) return

    setMutating(true)
    setMutationErrors([])
    try {
      if (category.status === 'Archived') await unarchiveCategory(category.id, accessToken)
      else await archiveCategory(category.id, accessToken)
      setSuccessMessage(`“${category.name}” was ${category.status === 'Archived' ? 'restored' : 'archived'}.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeApiError(error))
    } finally {
      setMutating(false)
    }
  }

  const confirmBulkDelete = async () => {
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
  }

  const restoreArchivedArticle = async (article: ArticleListItemResponse) => {
    if (!accessToken || !canDeleteArticle || article.status !== 'Archived' || mutating) return

    setMutating(true)
    setMutationErrors([])

    try {
      await unarchiveArticle(article.articleId, accessToken)
      setSuccessMessage(`“${article.title}” was restored.`)
      refresh()
    } catch (error) {
      setMutationErrors(describeLifecycleError(error))
    } finally {
      setMutating(false)
    }
  }

  const toggleArticle = (articleId: string) => {
    setSelectedArticleIds(current => {
      const next = new Set(current)

      if (next.has(articleId)) next.delete(articleId)
      else next.add(articleId)

      return next
    })
  }

  const itemActions = (item: DashboardItem) => {
    const label = item.kind === 'category' ? item.category.name : item.article.title
    const canEdit = item.kind === 'category'
      ? canManageCategories
      : canEditDashboardArticle({ article: item.article, permissionContext })
    const canDelete = item.kind === 'category'
      ? canManageCategories
      : canDeleteArticle && item.article.status !== 'Archived'
    const canDuplicate = item.kind === 'category'
      ? canManageCategories
      : canCreateArticle && canEditOwnArticle
    const canRead = item.kind === 'category' || canViewArticles

    const action = (
      title: string,
      icon: ReactNode,
      onClick: () => void,
      options: { color?: 'primary' | 'error'; hidden?: boolean } = {}
    ) => options.hidden ? null : (
      <Tooltip key={title} title={title}>
        <IconButton
          size='small'
          color={options.color}
          disabled={mutating}
          onClick={event => {
            stopRowAction(event)
            onClick()
          }}
          onMouseDown={stopRowAction}
          aria-label={`${title} ${label}`}
        >
          {icon}
        </IconButton>
      </Tooltip>
    )

    return (
      <Stack
        className='dashboard-row-actions'
        direction='row'
        spacing={0.125}
        onClick={stopRowAction}
        sx={{ justifyContent: 'flex-end', opacity: 0, pointerEvents: 'none', transition: 'opacity 140ms ease' }}
      >
        {action('Edit slug', <Pencil size={15} />, () => {
          if (item.kind === 'category') {
            setEditingCategory(item.category)
            setMutationErrors([])
            setCategoryDialogOpen(true)
          } else void openArticleEdit(item.article)
        }, { color: 'primary', hidden: !canEdit })}
        {action('Delete', <Trash2 size={15} />, () => {
          if (item.kind === 'category') setCategoryDeleteTarget(item.category)
          else setDeleteTarget(item.article)
        }, { color: 'error', hidden: !canDelete })}
        {action('Duplicate', <Copy size={15} />, () => void duplicateItem(item), { hidden: !canDuplicate })}
        {action('Copy link', <ExternalLink size={15} />, () => void copyItemLink(item), { hidden: !canRead })}
        {/* TODO: Connect PDF export to the export-jobs API when dashboard item export is enabled. */}
        {action('Export PDF', <Download size={15} />, () => setSuccessMessage('PDF export is coming soon.'), { hidden: !canRead })}
        {/* TODO: Connect HTML export to the export-jobs API when dashboard item export is enabled. */}
        {action('Export HTML', <FileCode2 size={15} />, () => setSuccessMessage('HTML export is coming soon.'), { hidden: !canRead })}
        {/* TODO: Connect preview to the localized preview surface when it is available. */}
        {action('Preview', <Eye size={15} />, () => setSuccessMessage('Preview is coming soon.'), { hidden: !canRead })}
        {item.kind === 'category' && action(
          item.category.status === 'Archived' ? 'Unarchive' : 'Archive',
          item.category.status === 'Archived' ? <RotateCcw size={15} /> : <Archive size={15} />,
          () => void setCategoryArchived(item.category),
          { hidden: !canManageCategories }
        )}
        {item.kind === 'article' && item.article.status === 'Archived' && action(
          'Restore',
          <RotateCcw size={15} />,
          () => void restoreArchivedArticle(item.article),
          { color: 'primary', hidden: !canDeleteArticle }
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
        data-dashboard-full-width
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
                        setEditingCategory(undefined)
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
                        setEditingArticle(undefined)
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
                <Table sx={{ inlineSize: '100%' }}>
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
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Skeleton width='70%' /></TableCell>
                        <TableCell align='right' sx={{ inlineSize: 1, whiteSpace: 'nowrap' }}>
                          <Skeleton width={200} sx={{ ml: 'auto' }} />
                        </TableCell>
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
                <Table aria-label='Categories and articles' sx={{ inlineSize: '100%' }}>
                  <TableBody>
                    {items.map(item => {
                      const isArticle = item.kind === 'article'
                      const selectable = isArticle && canDeleteArticle && item.article.status !== 'Archived'
                      const selected = isArticle && selectedArticleIds.has(item.article.articleId)

                      return (
                        <TableRow
                          key={item.id}
                          selected={selected}
                          hover
                          tabIndex={0}
                          onClick={() => openDashboardItem(item)}
                          onKeyDown={event => openDashboardItemFromKeyboard(event, item)}
                          onDragOver={event => dragOverItem(event, item)}
                          onDragLeave={leaveDragTarget}
                          onDrop={event => dropOnItem(event, item)}
                          sx={{
                            '& > *': { borderBlockEndColor: 'divider' },
                            '&.Mui-selected': { bgcolor: 'action.selected' },
                            cursor: 'pointer',
                            opacity: draggedItemId === item.id ? 0.48 : 1,
                            transition: theme.transitions.create(['opacity', 'background-color', 'box-shadow']),
                            ...(dropTarget?.id === item.id && {
                              boxShadow: dropTarget.placement === 'before'
                                ? 'inset 0 3px 0 var(--mui-palette-primary-main)'
                                : 'inset 0 -3px 0 var(--mui-palette-primary-main)',
                              bgcolor: 'action.hover'
                            }),
                            '&:hover .dashboard-drag-handle': {
                              opacity: 1,
                              pointerEvents: 'auto'
                            },
                            ...(!draggedItemId && {
                              '&:hover .dashboard-row-actions, &:focus-within .dashboard-row-actions': {
                                opacity: 1,
                                pointerEvents: 'auto'
                              }
                            })
                          }}
                        >
                          <TableCell padding='checkbox'>
                            <Stack direction='row' spacing={0.25} sx={{ alignItems: 'center' }}>
                              {dragHandle(item)}
                              {isArticle ? (
                                <Checkbox
                                  size='small'
                                  checked={selected}
                                  disabled={!selectable}
                                  onChange={() => toggleArticle(item.article.articleId)}
                                  onClick={stopRowAction}
                                  slotProps={{ input: { 'aria-label': `Select ${item.article.title}` } }}
                                />
                              ) : <Box sx={{ inlineSize: 34 }} />}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ py: 1.5 }}>
                            <ItemName item={item} />
                            <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 1 }}>
                              {item.kind === 'category' ? item.category.status === 'Archived' && (
                                <StatusChip label='Archived' color='secondary' />
                              ) : (
                                <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                                  <ArticleBadges article={item.article} />
                                  <Typography variant='caption' color='text.secondary'>
                                    By {item.article.owner.fullName} · Languages —
                                  </Typography>
                                </Stack>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, py: 1.25 }}>
                            {item.kind === 'category' ? item.category.status === 'Archived' && (
                              <StatusChip label='Archived' color='secondary' />
                            ) : (
                              <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
                                <ArticleBadges article={item.article} />
                                <Stack direction='row' spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                  <Stack direction='row' spacing={0.5} sx={{ alignItems: 'center' }}>
                                    <UserRound size={13} aria-hidden='true' />
                                    <Typography variant='caption' color='text.secondary'>
                                      {item.article.owner.fullName}
                                    </Typography>
                                  </Stack>
                                  {/* TODO: Replace this placeholder when article localization versions are available. */}
                                  <Typography variant='caption' color='text.secondary'>Languages —</Typography>
                                </Stack>
                              </Stack>
                            )}
                          </TableCell>
                          <TableCell align='right' sx={{ inlineSize: 1, whiteSpace: 'nowrap', py: 1.25 }}>
                            {itemActions(item)}
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
                      role={item.kind === 'category' ? 'button' : 'link'}
                      tabIndex={0}
                      onClick={() => openDashboardItem(item)}
                      onKeyDown={event => openDashboardItemFromKeyboard(event, item)}
                      onDragOver={event => dragOverItem(event, item)}
                      onDragLeave={leaveDragTarget}
                      onDrop={event => dropOnItem(event, item)}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        minBlockSize: 168,
                        p: 2.25,
                        border: 1,
                        borderColor: selected ? 'primary.main' : 'divider',
                        borderRadius: 1.5,
                        bgcolor: selected ? 'action.selected' : 'background.paper',
                        cursor: 'pointer',
                        opacity: draggedItemId === item.id ? 0.48 : 1,
                        transition: theme.transitions.create(['border-color', 'background-color', 'box-shadow']),
                        '&:hover': { borderColor: 'text.disabled', boxShadow: theme.shadows[2] },
                        ...(dropTarget?.id === item.id && {
                          boxShadow: dropTarget.placement === 'before'
                            ? 'inset 0 3px 0 var(--mui-palette-primary-main)'
                            : 'inset 0 -3px 0 var(--mui-palette-primary-main)',
                          bgcolor: 'action.hover'
                        }),
                        '&:hover .dashboard-drag-handle': {
                          opacity: 1,
                          pointerEvents: 'auto'
                        },
                        ...(!draggedItemId && {
                          '&:hover .dashboard-row-actions, &:focus-within .dashboard-row-actions': {
                            opacity: 1,
                            pointerEvents: 'auto'
                          }
                        })
                      }}
                    >
                      <Stack direction='row' sx={{ alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                        <Stack direction='row' spacing={0.25} sx={{ alignItems: 'center' }}>
                          {dragHandle(item)}
                          {isArticle ? (
                            <Checkbox
                              size='small'
                              checked={selected}
                              disabled={!selectable}
                              onChange={() => toggleArticle(item.article.articleId)}
                              onClick={stopRowAction}
                              slotProps={{ input: { 'aria-label': `Select ${item.article.title}` } }}
                              sx={{ p: 0.5, ml: -0.5 }}
                            />
                          ) : <Box />}
                        </Stack>
                        {item.kind === 'category'
                          ? item.category.status === 'Archived' && <StatusChip label='Archived' color='secondary' />
                          : <ArticleBadges article={item.article} />}
                      </Stack>
                      <ItemName item={item} />
                      <Typography variant='caption' color='text.secondary' noWrap sx={{ mt: 1.5 }}>
                        {item.kind === 'category'
                          ? item.category.path || 'Top-level category'
                          : `By ${item.article.owner.fullName}`}
                      </Typography>
                      {item.kind === 'article' && (
                        // TODO: Replace this placeholder when article localization versions are available.
                        <Typography variant='caption' color='text.secondary'>Languages —</Typography>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Divider sx={{ my: 1.75 }} />
                      {itemActions(item)}
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
        category={editingCategory}
        categories={categories}
        submitting={mutating}
        errors={mutationErrors}
        onClose={() => {
          if (!mutating) {
            setCategoryDialogOpen(false)
            setEditingCategory(undefined)
          }
        }}
        onSubmit={submitCategory}
      />
      <KbArticleDialog
        open={articleDialogOpen}
        article={editingArticle}
        categories={categories}
        submitting={mutating}
        errors={mutationErrors}
        onClose={() => {
          if (!mutating) {
            setArticleDialogOpen(false)
            setEditingArticle(undefined)
          }
        }}
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
        open={Boolean(categoryDeleteTarget)}
        title='Delete category?'
        description={categoryDeleteTarget
          ? `Delete “${categoryDeleteTarget.name}”? Categories with children or articles cannot be deleted.`
          : ''}
        confirmLabel='Delete'
        confirmColor='error'
        submitting={mutating}
        onClose={() => { if (!mutating) setCategoryDeleteTarget(undefined) }}
        onConfirm={() => void confirmCategoryDelete()}
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
