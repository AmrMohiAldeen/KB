'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { X } from 'lucide-react'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import KbFormGrid from '../forms/KbFormGrid'

// Type Imports
import type { KbUserRole } from '@/types/apps/userTypes'



type KbUserDrawerProps = {
  open: boolean
  onClose: () => void
  onSubmit: () => void
}

const roleOptions: Array<{ value: KbUserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'author', label: 'Author' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'viewer', label: 'Viewer' }
]

export const KbUserDrawer = ({ open, onClose, onSubmit }: KbUserDrawerProps) => {
  const [role, setRole] = useState<KbUserRole | ''>('')

  const handleSubmit = () => {
    // TODO: Connect to backend SSO/company user API before enabling frontend role assignment.
    onSubmit()
  }

  return (
    <Drawer
      open={open}
      anchor='right'
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { inlineSize: { xs: '100%', sm: 460 } } }}
    >
      <Stack direction='row' spacing={3} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', p: 5 }}>
        <Stack spacing={0.5}>
          <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
            Add User
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            Attach an existing SSO identity to one global KB role.
          </Typography>
        </Stack>
        <IconButton onClick={onClose} aria-label='Close user drawer'>
          <X size={18} />
        </IconButton>
      </Stack>
      <Divider />
      <Stack spacing={5} sx={{ p: 5 }}>
        <KbFormGrid columns={1}>
          <CustomTextField label='Full Name' placeholder='Name from SSO profile' fullWidth />
          <CustomTextField label='Email' placeholder='Email address' fullWidth />
          <CustomTextField label='SSO Subject ID' placeholder='Identity provider subject' fullWidth />
          <CustomTextField
            select
            label='Global KB Role'
            value={role}
            onChange={event => setRole(event.target.value as KbUserRole | '')}
            fullWidth
          >
            <MenuItem value=''>Not selected</MenuItem>
            {roleOptions.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </CustomTextField>
        </KbFormGrid>
        <Stack direction='row' spacing={2}>
          <Button variant='contained' onClick={handleSubmit}>
            Add User
          </Button>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  )
}

export default KbUserDrawer
