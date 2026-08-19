'use client'

import { styled } from '@mui/material/styles'

import CustomTextField from '@core/components/mui/TextField'
import kbDesignTokens from '@core/theme/designTokens'

/** Standard field used for search, filter, and sort controls above data tables. */
export const KbTableFilter = styled(CustomTextField)(({ theme }) => ({
  minInlineSize: 156,
  maxInlineSize: '100%',
  '& .MuiInputBase-root': {
    blockSize: kbDesignTokens.controlHeight,
    minBlockSize: kbDesignTokens.controlHeight,
    borderRadius: kbDesignTokens.radius.md,
    backgroundColor: 'var(--mui-palette-background-paper) !important'
  },
  '& .MuiInputBase-input': {
    fontSize: theme.typography.body2.fontSize,
    lineHeight: theme.typography.body2.lineHeight
  },
  '& .MuiInputAdornment-root': {
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center'
  },
  '& .MuiSelect-select': {
    display: 'flex',
    alignItems: 'center'
  },
  '& .MuiSelect-icon': {
    insetBlockStart: '50%',
    marginBlockStart: '-0.625rem'
  }
}))

export default KbTableFilter
