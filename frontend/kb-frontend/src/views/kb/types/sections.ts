// MUI Type Imports
import type { ChipProps } from '@mui/material/Chip'

export type KbMetric = {
  label: string
  value: string
  helper?: string
}

export type KbRecord = {
  id: string
  title: string
  description: string
  status: string
  statusColor?: ChipProps['color']
  owner: string
  updatedAt: string
  meta?: string
}

export type KbSectionConfig = {
  title: string
  description: string
  entityName: string
  primaryAction: string
  emptyTitle: string
  emptyBody: string
  metrics?: KbMetric[]
  records?: KbRecord[]
}
