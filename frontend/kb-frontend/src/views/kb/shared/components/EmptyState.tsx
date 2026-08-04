'use client'

// React Type Imports
import type { ReactNode } from 'react'

// Component Imports
import { KbEmptyState } from '@/views/shared'

type EmptyStateProps = {
  title: string
  body: string
  action?: ReactNode
  compact?: boolean
}

export const EmptyState = ({ title, body, action, compact = false }: EmptyStateProps) => (
  <KbEmptyState compact={compact} title={title} description={body} action={action} />
)

export default EmptyState
