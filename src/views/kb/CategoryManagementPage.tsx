'use client'

import { useMemo, useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Edit2, Plus, Search } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import KbCategoryDialog from './KbCategoryDialog'
import { CategoryTree, MetricStrip, PageHeader, formatDate } from './KbShared'
import { kbCategories } from './kbMockData'
import type { KbCategoryNode } from './kbMockData'

type FlatCategory = KbCategoryNode & {
  depth: number
  parentName: string
}

const flattenCategories = (
  categories: KbCategoryNode[],
  parentName = 'Top level',
  depth = 0
): FlatCategory[] =>
  categories.flatMap(category => [
    { ...category, depth, parentName },
    ...(category.children ? flattenCategories(category.children, category.name, depth + 1) : [])
  ])

const CategoryManagementPage = () => {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<KbCategoryNode | undefined>()

  const flatCategories = useMemo(() => {
    // TODO: connect to backend category API.
    // GET /api/kb/categories should return the category tree with article counts and no permission fields.
    const needle = search.trim().toLowerCase()

    return flattenCategories(kbCategories).filter(category =>
      needle
        ? `${category.name} ${category.subtitle} ${category.slug} ${category.parentName}`.toLowerCase().includes(needle)
        : true
    )
  }, [search])

  const openCreateDialog = () => {
    setEditingCategory(undefined)
    setDialogOpen(true)
  }

  const openEditDialog = (category: KbCategoryNode) => {
    setEditingCategory(category)
    setDialogOpen(true)
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Categories'
        subtitle='Organize articles into a clean public navigation tree.'
        actions={
          <Button variant='contained' startIcon={<Plus size={18} />} onClick={openCreateDialog}>
            New Category
          </Button>
        }
      />

      <MetricStrip
        metrics={[
          { label: 'Top-level categories', value: '4' },
          { label: 'Nested categories', value: '3' },
          { label: 'Articles assigned', value: '35' },
          { label: 'Unassigned articles', value: '3' }
        ]}
      />

      <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
        <Card variant='outlined'>
          <CardContent>
            <Typography variant='h6' className='mbe-4'>
              Category Tree
            </Typography>
            <CategoryTree categories={kbCategories} />
          </CardContent>
        </Card>

        <Card variant='outlined'>
          <CardContent className='pbs-4'>
            <Stack spacing={4}>
              <CustomTextField
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search categories'
                fullWidth
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

              <Box className='overflow-x-auto'>
                <Table size='small' aria-label='Category management table'>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Slug</TableCell>
                      <TableCell>Parent</TableCell>
                      <TableCell>Articles</TableCell>
                      <TableCell>Updated</TableCell>
                      <TableCell align='right'>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {flatCategories.map(category => (
                      <TableRow key={category.id} hover>
                        <TableCell>
                          <Box className='flex flex-col' style={{ paddingInlineStart: category.depth * 20 }}>
                            <Typography color='text.primary' className='font-medium'>
                              {category.name}
                            </Typography>
                            <Typography variant='body2' color='text.secondary'>
                              {category.subtitle}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{category.slug}</TableCell>
                        <TableCell>{category.parentName}</TableCell>
                        <TableCell>{category.articleCount}</TableCell>
                        <TableCell>{formatDate(category.updatedAt)}</TableCell>
                        <TableCell align='right'>
                          <Tooltip title='Edit category'>
                            <IconButton size='small' onClick={() => openEditDialog(category)}>
                              <Edit2 size={18} />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <KbCategoryDialog
        open={dialogOpen}
        category={editingCategory}
        categories={kbCategories}
        onClose={() => setDialogOpen(false)}
      />
    </Stack>
  )
}

export default CategoryManagementPage

