'use client'

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { PaletteColor } from '@mui/material/styles'
import { MoreVertical } from 'lucide-react'

import KbEmptyState from '../KbEmptyState'

type KbKanbanColumnProps = {
  title: string
  count: number
  icon: ReactNode
  tone: 'primary' | 'info' | 'secondary' | 'warning' | 'success'
  children: ReactNode
}

export const KbKanbanColumn = ({ title, count, icon, tone, children }: KbKanbanColumnProps) => (
  <Box
    sx={theme => {
      const palette = theme.palette[tone] as PaletteColor

      return {
        display: 'flex',
        minBlockSize: 520,
        flexDirection: 'column',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
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
        <IconButton size='small' aria-label={`${title} actions`}>
          <MoreVertical size={18} />
        </IconButton>
      </Stack>
    </Stack>
    <Stack spacing={3} sx={{ flex: 1, p: 3 }}>
      {children}
    </Stack>
  </Box>
)

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
