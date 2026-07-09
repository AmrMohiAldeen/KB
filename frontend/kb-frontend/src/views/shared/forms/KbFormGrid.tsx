'use client'

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import type { SxProps, Theme } from '@mui/material/styles'

type KbFormGridProps = {
  children: ReactNode
  columns?: 1 | 2 | 3
  sx?: SxProps<Theme>
}

export const KbFormGrid = ({ children, columns = 2, sx }: KbFormGridProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: '1fr',
        md: columns === 1 ? '1fr' : `repeat(${Math.min(columns, 2)}, minmax(0, 1fr))`,
        xl: columns === 3 ? 'repeat(3, minmax(0, 1fr))' : undefined
      },
      gap: 4,
      ...sx
    }}
  >
    {children}
  </Box>
)

export default KbFormGrid
