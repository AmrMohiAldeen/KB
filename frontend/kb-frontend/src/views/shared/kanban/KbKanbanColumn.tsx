'use client'

// React Imports
import {useState} from 'react'
import type { MouseEvent, ReactNode } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { PaletteColor } from '@mui/material/styles'
import { MoreVertical } from 'lucide-react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'

// Component Imports
import KbEmptyState from '../KbEmptyState'

type KbKanbanColumnProps = {
  title: string
  count: number
  icon: ReactNode
  tone: 'primary' | 'info' | 'secondary' | 'warning' | 'success'
  children: ReactNode
}

export const KbKanbanColumn = ({ title, count, icon, tone, children }: KbKanbanColumnProps) => {
  // States
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  // Vars
  const menuOpen = Boolean(anchorEl)

  // Handlers
  const handleMenuOpen = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }
  return (
    <Box
      sx={theme => {
        const palette = theme.palette[tone] as PaletteColor

        return {
          display: 'flex',
          minBlockSize: 520,
          flexDirection: 'column',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 'var(--mui-shape-customBorderRadius-lg)',
          bgcolor: alpha(palette.main, 0.045),
          overflow: 'hidden'
        }
      }}
    >
      <Stack
        direction='row'
        spacing={2}
        sx={theme => ({
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 4,
          py: 3,
          borderBlockStart: `3px solid ${(theme.palette[tone] as PaletteColor).main}`,
          borderBlockEnd: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha((theme.palette[tone] as PaletteColor).main, 0.05)
        })}
      >
        <Stack direction='row' spacing={2} sx={{ alignItems: 'center', minInlineSize: 0 }}>
          <Box sx={{ display: 'flex', color: `${tone}.main`, '& svg': { inlineSize: 18, blockSize: 18 } }}>{icon}</Box>
          <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>
            {title}
          </Typography>
        </Stack>
        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant='body2' color='text.secondary'>
            {count}
          </Typography>
          <IconButton
           size='small' 
           aria-label={`${title} actions`}
           aria-controls={menuOpen ? '${title}-menu' : undefined}
           aria-haspopup='true'
           aria-expanded={menuOpen ? 'true' : undefined}
           onClick={handleMenuOpen}
          >
            <MoreVertical size={18} />
          </IconButton>
          <Menu 
            id={`${title}-menu`}
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            anchorOrigin ={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleMenuClose}>Refresh</MenuItem>
          </Menu>
        </Stack>
      </Stack>
      <Stack spacing={3} sx={{ flex: 1, p: 3 }}>
        {children}
      </Stack>
    </Box>
  )
}
export const KbKanbanColumnEmptyState = () => (
  <KbEmptyState
    compact
    title='No cards'
    description='Workflow cards will appear here after the review board API is connected.'
    minHeight={220}
    sx={{ flex: 1, borderStyle: 'solid', bgcolor: 'background.paper' }}
  />
)

export default KbKanbanColumn
