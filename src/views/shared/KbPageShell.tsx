'use client'

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import type { SxProps, Theme } from '@mui/material/styles'

type KbPageShellProps = {
  children: ReactNode
  maxWidth?: number | string
  spacing?: number
  sx?: SxProps<Theme>
}

export const KbPageShell = ({ children, maxWidth = 1560, spacing = 5, sx }: KbPageShellProps) => (
  <Box sx={{ inlineSize: '100%', maxInlineSize: maxWidth, mx: 'auto', ...sx }}>
    <Stack spacing={{ xs: Math.max(spacing - 1, 3), md: spacing }}>{children}</Stack>
  </Box>
)

export default KbPageShell
