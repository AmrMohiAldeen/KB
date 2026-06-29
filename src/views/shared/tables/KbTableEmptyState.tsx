'use client'

import type { ReactNode } from 'react'

import { TableProperties } from 'lucide-react'

import KbEmptyState from '../KbEmptyState'

export type KbTableEmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export const KbTableEmptyState = ({ title, description, action }: KbTableEmptyStateProps) => (
  <KbEmptyState title={title} description={description} action={action} icon={<TableProperties />} minHeight={300} />
)

export default KbTableEmptyState
