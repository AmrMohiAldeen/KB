'use client'

// MUI Type Imports
import type { ChipProps } from '@mui/material/Chip'

// Component Imports
import { KbStatusChip } from '@/views/shared'

type StatusChipProps = {
  label: string
  color?: ChipProps['color']
}

export const StatusChip = ({ label, color }: StatusChipProps) => <KbStatusChip label={label} color={color} />

export default StatusChip
