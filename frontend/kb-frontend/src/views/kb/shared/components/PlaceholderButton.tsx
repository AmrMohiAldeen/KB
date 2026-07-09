'use client'

// React Type Imports
import type { ReactNode } from 'react'

// MUI Imports
import Button from '@mui/material/Button'

type PlaceholderButtonProps = {
  children: ReactNode
  startIcon?: ReactNode
}

export const PlaceholderButton = ({ children, startIcon }: PlaceholderButtonProps) => (
  <Button variant='outlined' disabled startIcon={startIcon}>
    {children}
  </Button>
)

export default PlaceholderButton
