'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Stack from '@mui/material/Stack'

// Component Imports
import KbSectionCard from '../KbSectionCard'

type KbFormSectionProps = {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}

export const KbFormSection = ({ title, description, actions, children }: KbFormSectionProps) => (
  <KbSectionCard title={title} description={description} actions={actions}>
    {/* TODO: Connect backend validation/API errors for this form section when endpoints are available. */}
    <Stack spacing={4}>{children}</Stack>
  </KbSectionCard>
)

export default KbFormSection
