'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import {
  Archive,
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
  Trash2
} from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import { KbEmptyState, KbPageShell, KbSectionCard } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbConfirmDialog from '@/views/shared/dialogs/KbConfirmDialog'
import type { ArticleFormState } from '../articles/components/KbArticleDialog'
import KbArticleDialog from '../articles/components/KbArticleDialog'
import type { CategoryFormState } from '../categories/utils/categoryForm'
import KbCategoryDialog from '../categories/components/KbCategoryDialog'
import DashboardCategoryTree from './DashboardCategoryTree'
import PageHeader from '../shared/components/PageHeader'
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
  getDashboardArticles,
  getDashboardEverythingCount,
  getDashboardPermissionContext
} from '@/lib/api/dashboardApi'
import { describeApiError } from '@/lib/api/http'
import {
  buildDashboardItems,
  canEditDashboardArticle,
  flattenDashboardCategories
} from './utils/dashboardItems'
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
  <Stack direction='row' spacing={2.5} sx={{ alignItems: 'center', minInlineSize: 220 }}>
    <Avatar
      variant='rounded'
      sx={theme => ({
        inlineSize: 38,
        blockSize: 38,
        bgcolor: item.kind === 'category'
          ? theme.palette.warning.light
          : theme.palette.primary.light,
        color: item.kind === 'category'
          ? theme.palette.warning.dark
          : theme.palette.primary.dark
      })}
    >
      {item.kind === 'category' ? <Folder size={19} /> : <FileText size={19} />}
    </Avatar>
    <Box sx={{ minInlineSize: 0 }}>
      <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>
        {item.kind === 'category' ? item.category.name : item.article.title}
      </Typography>
      <Typography variant='body2' color='text.secondary' noWrap>
        {item.kind === 'category' ? item.category.path || item.category.slug : item.article.slug}
      </Typography>
    </Box>
  </Stack>
)

const UnavailableCategoryDate = () => (
  // TODO(backend): add createdAt and updatedAt to GET /api/categories/tree and GET /api/categories/{id}.
  <Tooltip title='Category timestamps are not returned by the current backend API.'>
    <Typography component='span' variant='body2' color='text.secondary' aria-label='Last updated unavailable'>
      Not available
    </Typography>
  </Tooltip>
)

const KnowledgeDashboard = ({ accessToken }: KnowledgeDashboardProps) => {
  const router = useRouter()
  const { lang } = useParams<{ lang: string }>()
  const [categories, setCategories] = useState<KbCategoryNode[]>([])
  const [articles, setArticles] = useState<ArticleListItemResponse[]>([])
  const [permissionContext, setPermissionContext] = useState<DashboardPermissionContext | null>(null)
  const [activeFilter, setActiveFilter] = useState<DashboardArticleFilter>('Everything')
  const [categoryId, setCategoryId] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSort] = useState<DashboardSort>('position')
  const [view, setView] = useState<DashboardView>('list')
  const [everythingCount, setEverythingCount] = useState<number | null>(null)
  const [activeCount, setActiveCount] = useState<number | null>(null)
  const [categoriesLoading, setCategoriesLoading] = useState(Boolean(accessToken))
  const [contentLoading, setContentLoading] = useState(Boolean(accessToken))
  const [mutating, setMutating] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [pageErrors, setPageErrors] = useState<string[]>(accessToken ? [] : [missingTokenMessage])
  const [mutationErrors, setMutationErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState('')
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [articleDialogOpen, setArticleDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ArticleListItemResponse>()
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setContentLoading(true)
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

    const articleRequest = getDashboardArticles({
      accessToken,
      filter: activeFilter,
      search: debouncedSearch || undefined,
      categoryId: categoryId || undefined,
      sort,
      signal: controller.signal
    })
    const everythingRequest = activeFilter === 'Everything'
      ? null
      : getDashboardEverythingCount({
          accessToken,
          search: debouncedSearch || undefined,
          categoryId: categoryId || undefined,
          signal: controller.signal
        })

    Promise.all([articleRequest, everythingRequest]).then(([result, total]) => {
      if (controller.signal.aborted) return

      setArticles(result.items)
      setActiveCount(result.totalCount)
      setEverythingCount(activeFilter === 'Everything' ? result.totalCount : total)
      setTruncated(result.truncated)
      setPageErrors([])
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return

      setArticles([])
      setActiveCount(null)
      setTruncated(false)
      setPageErrors(describeArticleApiError(error))
    }).finally(() => {
      if (!controller.signal.aborted) setContentLoading(false)
    })

    return () => controller.abort()
  }, [accessToken, activeFilter, categoryId, debouncedSearch, refreshKey, sort])

  const categoryOptions = useMemo(() => getCategoryOptions(categories), [categories])
  const listedCategories = useMemo(() => {
    if (!categoryId) return categories

    const selected = flattenDashboardCategories(categories).find(category => category.id === categoryId)

    return selected ? [selected] : []
  }, [categories, categoryId])
  const items = useMemo(
    () => buildDashboardItems({ categories: listedCategories, articles, search: debouncedSearch, sort }),
    [articles, debouncedSearch, listedCategories, sort]
  )
  const canCreateArticle = hasPermission(permissionContext, 'articles.create')
  const canManageCategories = hasPermission(permissionContext, 'categories.manage')
  const canDeleteArticle = hasPermission(permissionContext, 'articles.delete')
  const canViewArticles = hasPermission(permissionContext, 'articles.view')

  const applyFilter = (filter: DashboardArticleFilter) => {
    setContentLoading(true)
    setActiveFilter(filter)
    setMutationErrors([])
  }

  const selectCategory = (nextCategoryId: string) => {
    setContentLoading(true)
    setCategoryId(nextCategoryId)
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

  const articleActions = (article: ArticleListItemResponse) => {
    const canEdit = canEditDashboardArticle({ article, permissionContext })

    if (!canViewArticles && !canEdit && !canDeleteArticle)
      return <Typography variant='body2' color='text.secondary'>—</Typography>

    return (
      <Stack direction='row' spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
        {canViewArticles && (
          <Tooltip title='View article'>
            <IconButton
              size='small'
              onClick={() => router.push(getLocalizedUrl(`/kb/${article.slug}`, lang))}
              aria-label={`View ${article.title}`}
            >
              <Eye size={17} />
            </IconButton>
          </Tooltip>
        )}
        {canEdit && (
          <Tooltip title='Open editor'>
            <IconButton
              size='small'
              onClick={() => router.push(getLocalizedUrl(`/editor?articleId=${encodeURIComponent(article.articleId)}`, lang))}
              aria-label={`Edit ${article.title}`}
            >
              <Pencil size={17} />
            </IconButton>
          </Tooltip>
        )}
        {canDeleteArticle && (
          <Tooltip title='Delete article'>
            <IconButton
              size='small'
              color='error'
              disabled={mutating}
              onClick={() => setDeleteTarget(article)}
              aria-label={`Delete ${article.title}`}
            >
              <Trash2 size={17} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    )
  }

  const emptyState = activeFilter === 'Archived'
    ? {
        title: 'Archived articles are not available yet',
        description: 'The article API does not currently expose archive state or an archived filter.'
      }
    : debouncedSearch
      ? {
          title: 'No search results',
          description: `No article or category names match “${debouncedSearch}”.`
        }
      : {
          title: 'Nothing to show',
          description: categoryId || activeFilter !== 'Everything'
            ? 'No categories or articles match the selected filters.'
            : 'Create a category or article when content is ready to be added.'
        }

  return (
    <KbPageShell maxWidth={1680}>
      <PageHeader
        title='Dashboard'
        subtitle='Browse and manage knowledge base categories and articles from one place.'
        actions={
          canManageCategories || canCreateArticle ? (
            <>
              {canManageCategories && (
                <Button
                  variant='outlined'
                  startIcon={<Plus size={18} />}
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
                  variant='contained'
                  startIcon={<Plus size={18} />}
                  disabled={mutating || !categories.length}
                  onClick={() => {
                    setMutationErrors([])
                    setArticleDialogOpen(true)
                  }}
                >
                  New Article
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <KbValidationSummary title='Dashboard could not be loaded or changed' errors={[...pageErrors, ...mutationErrors]} />
      {pageErrors.length > 0 && (
        <Button variant='outlined' startIcon={<RotateCcw size={17} />} onClick={refresh} sx={{ alignSelf: 'flex-start' }}>
          Try again
        </Button>
      )}
      {successMessage && <Alert severity='success' onClose={() => setSuccessMessage('')}>{successMessage}</Alert>}
      {truncated && (
        <Alert severity='info'>
          This view shows the first 100 articles per status. Refine the search or category filter to see a narrower result.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: '300px minmax(0, 1fr)' },
          gap: 5,
          alignItems: 'start'
        }}
      >
        <Card
          component='aside'
          variant='outlined'
          aria-label='Dashboard navigation and article filters'
          sx={{ position: { xl: 'sticky' }, top: { xl: 88 }, borderRadius: 2, boxShadow: 'none' }}
        >
          <CardContent sx={{ p: 4, '&:last-child': { pb: 4 } }}>
            <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>
              Articles
            </Typography>
            <Stack spacing={0.75} sx={{ mt: 1.5 }}>
              {filterOptions.map(option => {
                const Icon = option.icon
                const count = option.value === 'Everything'
                  ? everythingCount
                  : option.value === activeFilter
                    ? activeCount
                    : null

                return (
                  <Button
                    key={option.value}
                    fullWidth
                    variant={activeFilter === option.value ? 'tonal' : 'text'}
                    color={activeFilter === option.value ? 'primary' : 'secondary'}
                    onClick={() => applyFilter(option.value)}
                    startIcon={<Icon size={17} />}
                    aria-pressed={activeFilter === option.value}
                    sx={{ justifyContent: 'flex-start', minBlockSize: 40, px: 2.5, borderRadius: 1.5 }}
                  >
                    <Box component='span' sx={{ flex: 1, textAlign: 'start' }}>{option.label}</Box>
                    <Typography component='span' variant='caption' color='inherit'>
                      {count ?? '—'}
                    </Typography>
                  </Button>
                )
              })}
            </Stack>

            <Divider sx={{ my: 4 }} />

            <Stack direction='row' sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>
                Categories
              </Typography>
              {categoryId && (
                <Button size='small' onClick={() => selectCategory('')}>Clear</Button>
              )}
            </Stack>
            <DashboardCategoryTree
              categories={categories}
              selectedCategoryId={categoryId}
              loading={categoriesLoading}
              onSelect={id => selectCategory(categoryId === id ? '' : id)}
            />
          </CardContent>
        </Card>

        <KbSectionCard
          contentSx={{ p: 0, '&:last-child': { pb: 0 } }}
          sx={{ minInlineSize: 0 }}
        >
          <Box sx={{ p: { xs: 4, md: 5 } }}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={3}
              useFlexGap
              sx={{ alignItems: { lg: 'center' }, justifyContent: 'space-between' }}
            >
              <CustomTextField
                fullWidth
                label='Search'
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search article and category names'
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position='start'>
                        <Search size={18} aria-hidden='true' />
                      </InputAdornment>
                    )
                  }
                }}
                sx={{ maxInlineSize: { lg: 460 } }}
              />

              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                useFlexGap
                sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
              >
                <CustomTextField
                  select
                  label='Status'
                  value={activeFilter}
                  onChange={event => applyFilter(event.target.value as DashboardArticleFilter)}
                  sx={{ minInlineSize: { sm: 190 } }}
                >
                  {filterOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </CustomTextField>
                <CustomTextField
                  select
                  label='Category'
                  value={categoryId}
                  onChange={event => selectCategory(event.target.value)}
                  sx={{ minInlineSize: { sm: 190 } }}
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
                  label='Sort by'
                  value={sort}
                  onChange={event => {
                    setContentLoading(true)
                    setSort(event.target.value as DashboardSort)
                  }}
                  sx={{ minInlineSize: { sm: 175 } }}
                >
                  {sortOptions.map(option => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                  ))}
                </CustomTextField>
                <ButtonGroup variant='outlined' aria-label='Dashboard view'>
                  <Tooltip title='List view'>
                    <IconButton
                      color={view === 'list' ? 'primary' : 'secondary'}
                      onClick={() => setView('list')}
                      aria-label='List view'
                      aria-pressed={view === 'list'}
                    >
                      <List size={19} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title='Grid view'>
                    <IconButton
                      color={view === 'grid' ? 'primary' : 'secondary'}
                      onClick={() => setView('grid')}
                      aria-label='Grid view'
                      aria-pressed={view === 'grid'}
                    >
                      <Grid2X2 size={19} />
                    </IconButton>
                  </Tooltip>
                </ButtonGroup>
              </Stack>
            </Stack>

            <Stack direction='row' sx={{ mt: 4, alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant='body2' color='text.secondary' aria-live='polite'>
                {contentLoading ? 'Loading content…' : `${items.length} visible item${items.length === 1 ? '' : 's'}`}
              </Typography>
              {(search || categoryId) && (
                <Button
                  size='small'
                  onClick={() => {
                    setSearch('')
                    selectCategory('')
                  }}
                >
                  Clear search & filters
                </Button>
              )}
            </Stack>
          </Box>

          <Divider />

          {activeFilter === 'Archived' && (
            <Alert severity='info' sx={{ m: { xs: 4, md: 5 }, mb: 0 }}>
              Archived article data is not exposed by the current backend API. Categories remain available for navigation.
            </Alert>
          )}

          {contentLoading ? (
            <Stack spacing={2} sx={{ p: 5 }} aria-label='Loading dashboard content'>
              {[1, 2, 3, 4, 5].map(row => (
                <Stack key={row} direction='row' spacing={3} sx={{ alignItems: 'center' }}>
                  <Skeleton variant='rounded' width={38} height={38} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width={`${55 + row * 4}%`} />
                    <Skeleton width='32%' />
                  </Box>
                  <Skeleton width={100} />
                </Stack>
              ))}
            </Stack>
          ) : items.length === 0 ? (
            <Box sx={{ p: { xs: 4, md: 6 } }}>
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
              <Table aria-label='Categories and articles' sx={{ minInlineSize: 940 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Status / contents</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell>Last updated</TableCell>
                    <TableCell align='right'>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id} hover>
                      <TableCell><ItemName item={item} /></TableCell>
                      <TableCell>
                        {item.kind === 'category' ? (
                          <Typography variant='body2'>
                            {item.category.articleCount} article{item.category.articleCount === 1 ? '' : 's'}
                          </Typography>
                        ) : (
                          <StatusChip
                            label={articleStatusLabel[item.article.status]}
                            color={articleStatusColor[item.article.status]}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.kind === 'category'
                          ? 'Navigation'
                          : item.article.category?.name ?? 'Uncategorized'}
                      </TableCell>
                      <TableCell>
                        {item.kind === 'category' ? '—' : item.article.owner.fullName}
                      </TableCell>
                      <TableCell>
                        {item.kind === 'category'
                          ? <UnavailableCategoryDate />
                          : formatDate(item.article.updatedAt)}
                      </TableCell>
                      <TableCell align='right'>
                        {item.kind === 'category' ? (
                          <Button size='small' onClick={() => selectCategory(item.category.id)}>
                            Browse
                          </Button>
                        ) : articleActions(item.article)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(3, minmax(0, 1fr))'
                },
                gap: 3,
                p: { xs: 4, md: 5 }
              }}
            >
              {items.map(item => (
                <Card key={item.id} variant='outlined' sx={{ display: 'flex', flexDirection: 'column', boxShadow: 'none' }}>
                  {item.kind === 'category' ? (
                    <CardActionArea
                      onClick={() => selectCategory(item.category.id)}
                      aria-label={`Browse ${item.category.name}`}
                      sx={{ flex: 1 }}
                    >
                      <CardContent>
                        <ItemName item={item} />
                        <Stack direction='row' spacing={1} sx={{ mt: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip size='small' label='Category' variant='tonal' color='warning' />
                          <Typography variant='body2' color='text.secondary'>
                            {item.category.articleCount} article{item.category.articleCount === 1 ? '' : 's'}
                          </Typography>
                        </Stack>
                        <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 3 }}>
                          Last updated: <UnavailableCategoryDate />
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  ) : (
                    <CardContent sx={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
                      <ItemName item={item} />
                      <Box sx={{ mt: 4 }}>
                        <StatusChip
                          label={articleStatusLabel[item.article.status]}
                          color={articleStatusColor[item.article.status]}
                        />
                      </Box>
                      <Stack spacing={1} sx={{ mt: 3, flex: 1 }}>
                        <Typography variant='body2' color='text.secondary'>
                          {item.article.category?.name ?? 'Uncategorized'}
                        </Typography>
                        <Typography variant='body2' color='text.secondary'>
                          {item.article.owner.fullName}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          Updated {formatDate(item.article.updatedAt)}
                        </Typography>
                      </Stack>
                      <Divider sx={{ my: 3 }} />
                      {articleActions(item.article)}
                    </CardContent>
                  )}
                </Card>
              ))}
            </Box>
          )}
        </KbSectionCard>
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
    </KbPageShell>
  )
}

export default KnowledgeDashboard
