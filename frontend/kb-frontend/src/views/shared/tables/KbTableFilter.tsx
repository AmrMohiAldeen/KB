'use client'

import { styled } from '@mui/material/styles'

import CustomTextField from '@core/components/mui/TextField'

/** Compact field used for filters placed above data tables. */
export const KbTableFilter = styled(CustomTextField)(({ theme }) => ({
  minInlineSize: 156,
  maxInlineSize: '100%',
  '& .MuiInputBase-root': {
    blockSize: 36,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: 'var(--mui-palette-background-paper) !important'
  },
  '& .MuiInputBase-input': {
    fontSize: theme.typography.body2.fontSize
  }
}))

export default KbTableFilter
