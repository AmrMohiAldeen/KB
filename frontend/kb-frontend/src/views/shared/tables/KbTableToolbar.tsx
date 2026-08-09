'use client'
// React Imports
import { useState } from 'react'
import type { ReactNode, MouseEvent } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Columns3, Search } from 'lucide-react'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

export type KbToolbarColumn = {
  id: string
  label: string
  hideable?: boolean
}

type KbTableToolbarProps = {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchSlot?: ReactNode
  filters?: ReactNode
  actions?: ReactNode
  selectedCount?: number
  columns?: KbToolbarColumn[]
  visibleColumnIds?: string[]
  onVisibleColumnIdsChange?: (columnIds: string[]) => void
}

export const KbTableToolbar = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
  searchSlot,
  filters,
  actions,
  selectedCount = 0,
  columns = [],
  visibleColumnIds = columns.map(column => column.id),
  onVisibleColumnIdsChange
}: KbTableToolbarProps) => {
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null)
  const hideableColumns = columns.filter(column => column.hideable !== false)

  const openColumnMenu = (event: MouseEvent<HTMLButtonElement>) => {
    setColumnMenuAnchor(event.currentTarget)
  }

  const toggleColumn = (columnId: string) => {
    const nextIds = visibleColumnIds.includes(columnId)
      ? visibleColumnIds.filter(id => id !== columnId)
      : [...visibleColumnIds, columnId]

    onVisibleColumnIdsChange?.(nextIds)
  }

  return (
    <Box
      sx={theme => ({
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        alignItems: { md: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
        borderBlockEnd: `1px solid ${theme.palette.divider}`,
        px: { xs: 2, md: 2.5 },
        py: 1.5,
        bgcolor: 'background.paper'
      })}
    >
      <Stack
        direction='row'
        spacing={1}
        useFlexGap
        sx={{ flex: 1, minInlineSize: 0, alignItems: 'center', flexWrap: 'wrap' }}
      >
        {searchSlot ??
          (typeof searchValue !== 'undefined' && onSearchChange ? (
            <CustomTextField
              value={searchValue}
              onChange={event => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              sx={{ flex: '1 1 220px', inlineSize: { xs: '100%', sm: 280 }, maxInlineSize: 340 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                        <Search size={16} />
                    </InputAdornment>
                  )
                }
              }}
            />
          ) : null)}
        {filters}
      </Stack>

      <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {selectedCount > 0 && (
          <Typography variant='body2' color='text.secondary'>
            {selectedCount} selected
          </Typography>
        )}
        {hideableColumns.length > 0 && onVisibleColumnIdsChange && (
          <>
            <Button size='small' variant='outlined' color='secondary' startIcon={<Columns3 size={16} />} onClick={openColumnMenu}>
              Columns
            </Button>
            <Menu
              anchorEl={columnMenuAnchor}
              open={Boolean(columnMenuAnchor)}
              onClose={() => setColumnMenuAnchor(null)}
              slotProps={{ paper: { sx: { minInlineSize: 220 } } }}
            >
              <Typography variant='overline' color='text.secondary' sx={{ display: 'block', px: 4, py: 2 }}>
                Visible columns
              </Typography>
              <Divider />
              {hideableColumns.map(column => (
                <MenuItem key={column.id} onClick={() => toggleColumn(column.id)}>
                  <Checkbox checked={visibleColumnIds.includes(column.id)} size='small' />
                  <ListItemText primary={column.label} />
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        {actions}
      </Stack>
    </Box>
  )
}

export default KbTableToolbar
