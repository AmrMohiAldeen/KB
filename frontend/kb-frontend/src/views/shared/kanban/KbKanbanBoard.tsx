'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Box from '@mui/material/Box'

type KbKanbanBoardProps = {
  children: ReactNode
}

export const KbKanbanBoard = ({ children }: KbKanbanBoardProps) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: '1fr',
        lg: 'repeat(2, minmax(0, 1fr))',
        xl: 'repeat(4, minmax(260px, 1fr))'
      },
      gap: 4,
      alignItems: 'stretch'
    }}
  >
    {children}
  </Box>
)

export default KbKanbanBoard
