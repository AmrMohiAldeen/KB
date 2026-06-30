'use client'

// React Type Imports
import type { ReactNode } from 'react'

// Component Imports
import { KbPageHeader } from '@/views/shared'

type PageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export const PageHeader = ({ title, subtitle, actions }: PageHeaderProps) => (
  <KbPageHeader title={title} description={subtitle} actions={actions} />
)

export default PageHeader
