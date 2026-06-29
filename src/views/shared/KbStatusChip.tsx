'use client'

import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'

export type KbKnownStatus =
  | 'Draft'
  | 'Submitted'
  | 'In Review'
  | 'To Review'
  | 'Changes Requested'
  | 'Approved'
  | 'Published'
  | 'Archived'
  | 'Not Loaded'
  | 'Not loaded'
  | 'Request'
  | 'Active'
  | 'Inactive'
  | 'Queued'
  | 'Failed'
  | 'Completed'
  | string

const statusColor: Record<string, ChipProps['color']> = {
  Draft: 'secondary',
  Submitted: 'info',
  'In Review': 'warning',
  'To Review': 'warning',
  'Changes Requested': 'warning',
  Approved: 'success',
  Published: 'success',
  Archived: 'secondary',
  'Not Loaded': 'default',
  'Not loaded': 'default',
  Request: 'info',
  Active: 'success',
  active: 'success',
  Inactive: 'secondary',
  inactive: 'secondary',
  Queued: 'info',
  Failed: 'error',
  Completed: 'success'
}

type KbStatusChipProps = {
  label: KbKnownStatus
  color?: ChipProps['color']
  size?: ChipProps['size']
}

export const KbStatusChip = ({ label, color, size = 'small' }: KbStatusChipProps) => (
  <Chip
    size={size}
    label={label}
    color={color ?? statusColor[String(label)] ?? 'default'}
    variant='tonal'
    sx={{ fontWeight: 600, textTransform: 'capitalize' }}
  />
)

export default KbStatusChip
