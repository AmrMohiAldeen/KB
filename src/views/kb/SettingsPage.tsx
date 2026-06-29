'use client'

import { useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { KeyRound, Save, ShieldCheck, UploadCloud, Webhook } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbFormSection from '@/views/shared/forms/KbFormSection'

import { KbPageShell, PageHeader, StatusChip } from './KbShared'

const SettingsPage = () => {
  const [reviewRequired, setReviewRequired] = useState(true)
  const [publicSearch, setPublicSearch] = useState(true)
  const [webhooksEnabled, setWebhooksEnabled] = useState(false)

  const handleSave = () => {
    // TODO: connect to backend settings API.
    // PATCH /api/kb/settings should persist general, SSO, export, API, and webhook settings with rowVersion.
  }

  return (
    <KbPageShell>
      <PageHeader
        title='Settings'
        subtitle='Configure global knowledge base behavior and integrations.'
        actions={
          <Button variant='contained' startIcon={<Save size={18} />} onClick={handleSave}>
            Save Changes
          </Button>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 360px' }, gap: 5 }}>
        <Stack spacing={5}>
          <KbFormSection title='General' description='Knowledge base defaults.'>
            <KbFormGrid>
              <CustomTextField label='Knowledge Base Name' placeholder='Knowledge base name' fullWidth />
              <CustomTextField label='Default Language' select defaultValue='' fullWidth>
                <MenuItem value=''>Not selected</MenuItem>
                <MenuItem value='en'>English</MenuItem>
                <MenuItem value='fr'>French</MenuItem>
                <MenuItem value='ar'>Arabic</MenuItem>
              </CustomTextField>
              <CustomTextField label='Public Base URL' placeholder='Public help center URL' fullWidth />
              <CustomTextField label='Autosave Interval' placeholder='Autosave interval' fullWidth />
            </KbFormGrid>
            <Stack spacing={2}>
              <FormControlLabel
                control={<Switch checked={reviewRequired} onChange={event => setReviewRequired(event.target.checked)} />}
                label='Require reviewer approval before publishing'
              />
              <FormControlLabel
                control={<Switch checked={publicSearch} onChange={event => setPublicSearch(event.target.checked)} />}
                label='Allow public search on published articles'
              />
            </Stack>
          </KbFormSection>

          <KbFormSection
            title='SSO'
            description='Authentication is handled by the configured identity provider.'
            actions={<ShieldCheck size={22} color='var(--mui-palette-primary-main)' />}
          >
            <KbFormGrid>
              <CustomTextField label='Provider' select defaultValue='' fullWidth>
                <MenuItem value=''>Not selected</MenuItem>
                <MenuItem value='saml'>SAML</MenuItem>
                <MenuItem value='oidc'>OIDC</MenuItem>
              </CustomTextField>
              <CustomTextField label='Default Role' select defaultValue='' fullWidth>
                <MenuItem value=''>Not selected</MenuItem>
                <MenuItem value='viewer'>Viewer</MenuItem>
                <MenuItem value='contributor'>Contributor</MenuItem>
              </CustomTextField>
            </KbFormGrid>
          </KbFormSection>

          <KbFormSection
            title='Export'
            description='Configure export formats and retention.'
            actions={<UploadCloud size={22} color='var(--mui-palette-primary-main)' />}
          >
            <KbFormGrid>
              <CustomTextField label='Default Format' select defaultValue='' fullWidth>
                <MenuItem value=''>Not selected</MenuItem>
                <MenuItem value='pdf'>PDF</MenuItem>
                <MenuItem value='html'>HTML</MenuItem>
                <MenuItem value='zip'>ZIP</MenuItem>
              </CustomTextField>
              <CustomTextField label='Export Retention' placeholder='Retention period' fullWidth />
            </KbFormGrid>
          </KbFormSection>
        </Stack>

        <Stack spacing={5}>
          <KbFormSection
            title='API'
            description='Service access settings.'
            actions={<KeyRound size={22} color='var(--mui-palette-primary-main)' />}
          >
            <Divider />
            <Box>
              <Typography variant='body2' color='text.secondary'>
                API status
              </Typography>
              <StatusChip label='Not loaded' />
            </Box>
            <CustomTextField label='Rate Limit' placeholder='Rate limit' fullWidth />
          </KbFormSection>

          <KbFormSection
            title='Webhooks'
            description='Notify external systems about KB events.'
            actions={<Webhook size={22} color='var(--mui-palette-primary-main)' />}
          >
            <Divider />
            <FormControlLabel
              control={<Switch checked={webhooksEnabled} onChange={event => setWebhooksEnabled(event.target.checked)} />}
              label='Enable webhooks'
            />
            <CustomTextField label='Endpoint URL' placeholder='Webhook endpoint URL' fullWidth />
            <CustomTextField label='Events' placeholder='Webhook event names' fullWidth multiline minRows={2} />
          </KbFormSection>
        </Stack>
      </Box>
    </KbPageShell>
  )
}

export default SettingsPage
