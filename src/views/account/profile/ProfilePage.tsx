'use client'

import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'

import CustomTextField from '@core/components/mui/TextField'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbFormSection from '@/views/shared/forms/KbFormSection'
import { KbPageHeader, KbPageShell, KbStatusChip } from '@/views/shared'

const ProfilePage = () => {
  const handleSave = () => {
    // TODO: connect to backend account profile API.
    // GET/PATCH /api/kb/me should hydrate SSO profile metadata and notification preferences without local auth credentials.
  }

  return (
    <KbPageShell>
      <KbPageHeader
        title='My Profile'
        description='Review your SSO-owned profile details and assigned KB role.'
        actions={
          <Button variant='contained' onClick={handleSave}>
            Save Preferences
          </Button>
        }
      />

      <KbFormSection title='Profile' description='Core identity details are managed by company SSO.'>
        <KbFormGrid>
          <CustomTextField label='Full Name' placeholder='Loaded from SSO' fullWidth disabled />
          <CustomTextField label='Email' placeholder='Loaded from SSO' fullWidth disabled />
          <CustomTextField label='SSO Subject ID' placeholder='Loaded from identity provider' fullWidth disabled />
          <CustomTextField label='Assigned Role' select defaultValue='' fullWidth disabled>
            <MenuItem value=''>Not loaded</MenuItem>
          </CustomTextField>
        </KbFormGrid>
        <KbStatusChip label='Not loaded' />
      </KbFormSection>
    </KbPageShell>
  )
}

export default ProfilePage
