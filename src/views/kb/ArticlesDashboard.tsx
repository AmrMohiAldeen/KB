'use client'

import { useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { FileText, Folder, Plus, Search } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import KbCategoryDialog from './KbCategoryDialog'
import { CategoryTree, PageHeader, StatusChip, articleStatusColor, formatDate } from './KbShared'
import { articleFilters, kbCategories, kbRows } from './kbMockData'
import type { ArticleFilter, ArticleStatus, KbListRow } from './kbMockData'

type SortValue = 'position' | 'updated' | 'title' | 'status'

const rowMatchesFilter = (row: KbListRow, filter: ArticleFilter) => {
  if (filter === 'Everything') return true
  if (row.kind === 'category') return true
  if (filter === 'Followed') return row.article.followed

  return row.article.status === filter
}

const rowText = (row: KbListRow) =>
  row.kind === 'category'
    ? row.name
    : `${row.article.title} ${row.article.categoryPath} ${row.article.owner} ${row.article.status}`

const compareRows = (sort: SortValue) => (a: KbListRow, b: KbListRow) => {
  if (sort === 'position') return 0
  if (sort === 'updated') {
    const aDate = a.kind === 'category' ? a.updatedAt : a.article.updatedAt
    const bDate = b.kind === 'category' ? b.updatedAt : b.article.updatedAt

    return new Date(bDate).getTime() - new Date(aDate).getTime()
  }

  const aValue = a.kind === 'category' ? a.name : sort === 'status' ? a.article.status : a.article.title
  const bValue = b.kind === 'category' ? b.name : sort === 'status' ? b.article.status : b.article.title

  return aValue.localeCompare(bValue)
}

const statusCountOrder: ArticleStatus[] = ['Published', 'Draft', 'To Review', 'Archived']

const ArticlesDashboard = () => {
  const [activeFilter, setActiveFilter] = useState<ArticleFilter>('Everything')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortValue>('position')
  const [dialogOpen, setDialogOpen] = useState(false)

  const visibleRows = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/kb/articles should accept filter, search, sort, pagination, and categoryId.
    const needle = search.trim().toLowerCase()

    return kbRows
      .filter(row => rowMatchesFilter(row, activeFilter))
      .filter(row => (needle ? rowText(row).toLowerCase().includes(needle) : true))
      .toSorted(compareRows(sort))
  }, [activeFilter, search, sort])

  return (
    <Stack spacing={6}>
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
                // TODO: connect to backend API for creating article drafts.
              }}
            >
              New Article
            </Button>
          </>
        }
      />

      <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
        <Card variant='outlined'>
          <CardContent>
            <Stack spacing={5}>
              <Box>
                <Typography variant='overline' color='text.secondary'>
                  Articles
                </Typography>
                <Stack spacing={1} className='mbe-2'>
                  {articleFilters.map(filter => (
                    <Button
                      key={filter.label}
                      variant={activeFilter === filter.label ? 'tonal' : 'text'}
                      color={activeFilter === filter.label ? 'primary' : 'secondary'}
                      className='justify-between'
                      onClick={() => setActiveFilter(filter.label)}
                    >
                      <span>{filter.label}</span>
                      <span>{filter.count}</span>
                    </Button>
                  ))}
                </Stack>
              </Box>
              <Divider />
              <Box>
                <Typography variant='overline' color='text.secondary'>
                  Categories
                </Typography>
                <CategoryTree categories={kbCategories} />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant='outlined'>
          <CardContent className='pbs-4'>
            <Stack spacing={4}>
              <Box className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                <Box className='flex flex-1 flex-col gap-3 md:flex-row md:items-center'>
                  <Checkbox aria-label='Select all articles' />
                  <Button variant='outlined' color='secondary'>
                    Actions
                  </Button>
                  <CustomTextField
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder='Search articles or categories'
                    className='min-is-0 flex-1'
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position='start'>
                            <Search size={18} />
                          </InputAdornment>
                        )
                      }
                    }}
                  />
                </Box>
                <CustomTextField
                  select
                  label='Sort By'
                  value={sort}
                  onChange={event => setSort(event.target.value as SortValue)}
                  className='is-full md:is-[190px]'
                >
                  <MenuItem value='position'>Position</MenuItem>
                  <MenuItem value='updated'>Updated Date</MenuItem>
                  <MenuItem value='title'>Title</MenuItem>
                  <MenuItem value='status'>Status</MenuItem>
                </CustomTextField>
              </Box>

              <Box className='overflow-x-auto'>
                <Table size='small' aria-label='Articles dashboard table'>
                  <TableHead>
                    <TableRow>
                      <TableCell padding='checkbox' />
                      <TableCell>Name</TableCell>
                      <TableCell>Status Counts</TableCell>
                      <TableCell>Owner</TableCell>
                      <TableCell>Updated</TableCell>
                      <TableCell align='right'>Views</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map(row =>
                      row.kind === 'category' ? (
                        <TableRow key={row.id} hover>
                          <TableCell padding='checkbox'>
                            <Checkbox aria-label={`Select ${row.name}`} />
                          </TableCell>
                          <TableCell>
                            <Box className='flex items-center gap-3'>
                              <Folder size={20} className='text-textSecondary' />
                              <Box>
                                <Typography color='text.primary' className='font-medium'>
                                  {row.name} ({row.articleCount})
                                </Typography>
                                <Typography variant='body2' color='text.secondary'>
                                  Category
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Stack direction='row' spacing={1} className='flex-wrap'>
                              {statusCountOrder.map(status => (
                                <StatusChip
                                  key={status}
                                  label={`${row.statusCounts[status]} ${status}`}
                                  color={articleStatusColor[status]}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>Organization</TableCell>
                          <TableCell>{formatDate(row.updatedAt)}</TableCell>
                          <TableCell align='right'>-</TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={row.article.id} hover>
                          <TableCell padding='checkbox'>
                            <Checkbox aria-label={`Select ${row.article.title}`} />
                          </TableCell>
                          <TableCell>
                            <Box className='flex items-center gap-3'>
                              <FileText size={20} className='text-textSecondary' />
                              <Box>
                                <Typography color='text.primary' className='font-medium'>
                                  {row.article.title}
                                </Typography>
                                <Typography variant='body2' color='text.secondary'>
                                  {row.article.categoryPath} / {row.article.version}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <StatusChip
                              label={row.article.status}
                              color={articleStatusColor[row.article.status]}
                            />
                          </TableCell>
                          <TableCell>{row.article.owner}</TableCell>
                          <TableCell>{formatDate(row.article.updatedAt)}</TableCell>
                          <TableCell align='right'>{row.article.views.toLocaleString()}</TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <KbCategoryDialog open={dialogOpen} categories={kbCategories} onClose={() => setDialogOpen(false)} />
    </Stack>
  )
}

export default ArticlesDashboard
