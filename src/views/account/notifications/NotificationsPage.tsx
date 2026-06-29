'use client'

import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'

import KbFormSection from '@/views/shared/forms/KbFormSection'
import { KbPageHeader, KbPageShell } from '@/views/shared'

const notificationOptions = [
  'Review events',
  'Comments',
  'Suggestions',
  'Publish events',
  'Export job completion',
  'Failed index jobs'
]

const AccountNotificationsPage = () => {
  const handleSave = () => {
    // TODO: connect to backend notification preferences API.
    // PATCH /api/kb/me/notification-preferences should persist event/channel preferences for the current SSO user.
  }

  return (
    <KbPageShell>
      <KbPageHeader
        title='Notification Preferences'
        description='Choose which KB workflow and operations events should notify you.'
        actions={
          <Button variant='contained' onClick={handleSave}>
            Save Preferences
          </Button>
        }
      />

      <KbFormSection title='Email Notifications' description='Preferences will be loaded from your account profile.'>
        <Stack spacing={2}>
          {notificationOptions.map(option => (
            <FormControlLabel key={option} control={<Checkbox disabled />} label={option} />
          ))}
        </Stack>
      </KbFormSection>
    </KbPageShell>
  )
}

export default AccountNotificationsPage
