'use client'

import type { ReactNode } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import { FileSearch } from 'lucide-react'

type KbEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
  minHeight?: number
  sx?: SxProps<Theme>
}

export const KbEmptyState = ({
  title,
  description,
  action,
  icon,
  compact = false,
  minHeight,
  sx
}: KbEmptyStateProps) => (
  <Box
    sx={[
      theme => ({
        display: 'flex',
        minBlockSize: minHeight ?? (compact ? 156 : 260),
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px dashed ${alpha(theme.palette.primary.main, 0.24)}`,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.035),
        p: compact ? 4 : 8,
        textAlign: 'center'
      }),
      ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ]}
  >
    <Stack spacing={compact ? 2 : 3} sx={{ alignItems: 'center', maxInlineSize: compact ? 360 : 520 }}>
      <Avatar
        variant='rounded'
        sx={theme => ({
          inlineSize: compact ? 42 : 54,
          blockSize: compact ? 42 : 54,
          color: theme.palette.primary.main,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          '& svg': {
            inlineSize: compact ? 20 : 24,
            blockSize: compact ? 20 : 24
          }
        })}
      >
        {icon ?? <FileSearch />}
      </Avatar>
      <Box>
        <Typography variant={compact ? 'subtitle1' : 'h6'} color='text.primary' sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 1, lineHeight: 1.6 }}>
          {description}
        </Typography>
      </Box>
      {action}
    </Stack>
  </Box>
)

export const KbEmptyStateAction = ({
  children,
  disabled = true
}: {
  children: ReactNode
  disabled?: boolean
}) => (
  <Button variant='outlined' color='secondary' disabled={disabled}>
    {children}
  </Button>
)

export default KbEmptyState
