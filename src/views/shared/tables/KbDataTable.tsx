'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import type { TableCellProps } from '@mui/material/TableCell'

// Component Imports
import KbSectionCard from '../KbSectionCard'
import KbTableEmptyState from './KbTableEmptyState'

// Type Imports
import type { KbTableEmptyStateProps } from './KbTableEmptyState'

export type KbSortDirection = 'asc' | 'desc'

export type KbDataTableColumn<T> = {
  id: string
  label: string
  render: (row: T) => ReactNode
  sortable?: boolean
  hideable?: boolean
  align?: TableCellProps['align']
  width?: number | string
}

export type KbDataTableSort = {
  columnId: string
  direction: KbSortDirection
}

type KbDataTablePagination = {
  page: number
  rowsPerPage: number
  totalRows?: number
  rowsPerPageOptions?: number[]
  onPageChange?: (page: number) => void
  onRowsPerPageChange?: (rowsPerPage: number) => void
}

type KbDataTableProps<T> = {
  ariaLabel: string
  rows: readonly T[]
  columns: readonly KbDataTableColumn<T>[]
  getRowId: (row: T) => string
  toolbar?: ReactNode
  emptyState: KbTableEmptyStateProps
  loading?: boolean
  enableSelection?: boolean
  selectedRowIds?: string[]
  onSelectedRowIdsChange?: (rowIds: string[]) => void
  visibleColumnIds?: string[]
  sort?: KbDataTableSort
  onSortChange?: (sort: KbDataTableSort) => void
  pagination?: KbDataTablePagination
}

export const KbDataTable = <T,>({
  ariaLabel,
  rows,
  columns,
  getRowId,
  toolbar,
  emptyState,
  loading = false,
  enableSelection = false,
  selectedRowIds = [],
  onSelectedRowIdsChange,
  visibleColumnIds,
  sort,
  onSortChange,
  pagination
}: KbDataTableProps<T>) => {
  const visibleColumns = visibleColumnIds?.length
    ? columns.filter(column => visibleColumnIds.includes(column.id))
    : columns

  const selectedRowSet = new Set(selectedRowIds)
  const allVisibleRowIds = rows.map(row => getRowId(row))
  const allRowsSelected = allVisibleRowIds.length > 0 && allVisibleRowIds.every(id => selectedRowSet.has(id))
  const someRowsSelected = allVisibleRowIds.some(id => selectedRowSet.has(id)) && !allRowsSelected
  const colSpan = visibleColumns.length + (enableSelection ? 1 : 0)

  const setSelection = (rowIds: string[]) => onSelectedRowIdsChange?.(rowIds)

  const toggleAllRows = () => {
    if (allRowsSelected) {
      setSelection(selectedRowIds.filter(id => !allVisibleRowIds.includes(id)))
    } else {
      setSelection(Array.from(new Set([...selectedRowIds, ...allVisibleRowIds])))
    }
  }

  const toggleRow = (rowId: string) => {
    setSelection(selectedRowSet.has(rowId) ? selectedRowIds.filter(id => id !== rowId) : [...selectedRowIds, rowId])
  }

  const handleSort = (column: KbDataTableColumn<T>) => {
    if (!column.sortable) return

    const direction = sort?.columnId === column.id && sort.direction === 'asc' ? 'desc' : 'asc'

    // TODO: connect table sort changes to server-side list APIs when backend endpoints are available.
    onSortChange?.({ columnId: column.id, direction })
  }

  return (
    <KbSectionCard contentSx={{ p: 0, '&:last-child': { pb: 0 } }}>
      {toolbar}
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table size='small' aria-label={ariaLabel} sx={{ minInlineSize: 760 }}>
          <TableHead>
            <TableRow
              sx={theme => ({
                bgcolor: theme.palette.customColors?.tableHeaderBg ?? 'background.paper',
                '& th': {
                  borderBlockEnd: `1px solid ${theme.palette.divider}`,
                  color: 'text.secondary',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  blockSize: 48,
                  whiteSpace: 'nowrap'
                }
              })}
            >
              {enableSelection && (
                <TableCell padding='checkbox'>
                  <Checkbox
                    size='small'
                    checked={allRowsSelected}
                    indeterminate={someRowsSelected}
                    onChange={toggleAllRows}
                    slotProps={{ input: { 'aria-label': 'Select all visible rows' } }}
                  />
                </TableCell>
              )}
              {visibleColumns.map(column => (
                <TableCell key={column.id} align={column.align} sx={{ inlineSize: column.width }}>
                  {column.sortable ? (
                    <TableSortLabel
                      active={sort?.columnId === column.id}
                      direction={sort?.columnId === column.id ? sort.direction : 'asc'}
                      onClick={() => handleSort(column)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={colSpan}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, py: 8 }}>
                    <CircularProgress size={22} />
                    <Typography color='text.secondary'>Loading rows</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              rows.map(row => {
                const rowId = getRowId(row)

                return (
                  <TableRow
                    key={rowId}
                    hover
                    selected={selectedRowSet.has(rowId)}
                    sx={theme => ({
                      '& td': {
                        borderBlockEnd: `1px solid ${theme.palette.divider}`,
                        blockSize: 58,
                        verticalAlign: 'middle'
                      },
                      '&:last-child td': {
                        borderBlockEnd: 0
                      }
                    })}
                  >
                    {enableSelection && (
                      <TableCell padding='checkbox'>
                        <Checkbox
                          size='small'
                          checked={selectedRowSet.has(rowId)}
                          onChange={() => toggleRow(rowId)}
                          slotProps={{ input: { 'aria-label': `Select row ${rowId}` } }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map(column => (
                      <TableCell key={column.id} align={column.align}>
                        {column.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </TableContainer>

      {!loading && rows.length === 0 && (
        <Box sx={{ p: { xs: 4, md: 5 }, borderBlockStart: theme => `1px solid ${theme.palette.divider}` }}>
          <KbTableEmptyState {...emptyState} />
        </Box>
      )}

      {pagination && (
        <TablePagination
          component='div'
          count={pagination.totalRows ?? rows.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          rowsPerPageOptions={pagination.rowsPerPageOptions ?? [10, 25, 50]}
          onPageChange={(_, page) => {
            // TODO: connect table page changes to server-side pagination when backend endpoints are available.
            pagination.onPageChange?.(page)
          }}
          onRowsPerPageChange={event => {
            // TODO: connect table page-size changes to server-side pagination when backend endpoints are available.
            pagination.onRowsPerPageChange?.(Number(event.target.value))
          }}
          sx={theme => ({ borderBlockStart: `1px solid ${theme.palette.divider}` })}
        />
      )}
    </KbSectionCard>
  )
}

export default KbDataTable
