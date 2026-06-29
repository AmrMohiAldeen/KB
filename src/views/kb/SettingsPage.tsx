'use client'

import { useState } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { KeyRound, Save, ShieldCheck, UploadCloud, Webhook } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import { MetricStrip, PageHeader, StatusChip } from './KbShared'

const SettingsPage = () => {
  const [reviewRequired, setReviewRequired] = useState(true)
  const [publicSearch, setPublicSearch] = useState(true)
  const [webhooksEnabled, setWebhooksEnabled] = useState(false)

  const handleSave = () => {
    // TODO: connect to backend settings API.
    // PATCH /api/kb/settings should persist general, SSO, export, API, and webhook settings with rowVersion.
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Settings'
        subtitle='Configure global knowledge base behavior and integrations.'
        actions={
          <Button variant='contained' startIcon={<Save size={18} />} onClick={handleSave}>
            Save Changes
          </Button>
        }
      />

      <MetricStrip
        metrics={[
          { label: 'Review required', value: reviewRequired ? 'Yes' : 'No' },
          { label: 'Public search', value: publicSearch ? 'Enabled' : 'Disabled' },
          { label: 'SSO provider', value: 'SAML' },
          { label: 'Webhooks', value: webhooksEnabled ? 'Enabled' : 'Disabled' }
        ]}
      />

      <Box className='grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]'>
        <Stack spacing={6}>
          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={5}>
                <Box>
                  <Typography variant='h6'>General</Typography>
                  <Typography color='text.secondary'>Knowledge base defaults.</Typography>
                </Box>
                <Box className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <CustomTextField label='Knowledge Base Name' defaultValue='SwiftAssess Knowledge Base' fullWidth />
                  <CustomTextField label='Default Language' select defaultValue='en' fullWidth>
                    <MenuItem value='en'>English</MenuItem>
                    <MenuItem value='fr'>French</MenuItem>
                    <MenuItem value='ar'>Arabic</MenuItem>
                  </CustomTextField>
                  <CustomTextField label='Public Base URL' defaultValue='https://help.example.com' fullWidth />
                  <CustomTextField label='Autosave Interval' defaultValue='1000 ms' fullWidth />
                </Box>
                <FormControlLabel
                  control={<Switch checked={reviewRequired} onChange={event => setReviewRequired(event.target.checked)} />}
                  label='Require reviewer approval before publishing'
                />
                <FormControlLabel
                  control={<Switch checked={publicSearch} onChange={event => setPublicSearch(event.target.checked)} />}
                  label='Allow public search on published articles'
                />
              </Stack>
            </CardContent>
          </Card>

          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={5}>
                <Box className='flex items-start gap-3'>
                  <ShieldCheck size={24} className='text-primary' />
                  <Box>
                    <Typography variant='h6'>SSO</Typography>
                    <Typography color='text.secondary'>Authentication is handled by the configured identity provider.</Typography>
                  </Box>
                </Box>
                <Box className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <CustomTextField label='Provider' select defaultValue='saml' fullWidth>
                    <MenuItem value='saml'>SAML</MenuItem>
                    <MenuItem value='oidc'>OIDC</MenuItem>
                  </CustomTextField>
                  <CustomTextField label='Default Role' select defaultValue='viewer' fullWidth>
                    <MenuItem value='viewer'>Viewer</MenuItem>
                    <MenuItem value='contributor'>Contributor</MenuItem>
                  </CustomTextField>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={5}>
                <Box className='flex items-start gap-3'>
                  <UploadCloud size={24} className='text-primary' />
                  <Box>
                    <Typography variant='h6'>Export</Typography>
                    <Typography color='text.secondary'>Configure export formats and retention.</Typography>
                  </Box>
                </Box>
                <Box className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <CustomTextField label='Default Format' select defaultValue='pdf' fullWidth>
                    <MenuItem value='pdf'>PDF</MenuItem>
                    <MenuItem value='html'>HTML</MenuItem>
                    <MenuItem value='zip'>ZIP</MenuItem>
                  </CustomTextField>
                  <CustomTextField label='Export Retention' defaultValue='30 days' fullWidth />
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Stack>

        <Stack spacing={6}>
          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={4}>
                <Box className='flex items-start gap-3'>
                  <KeyRound size={24} className='text-primary' />
                  <Box>
                    <Typography variant='h6'>API</Typography>
                    <Typography color='text.secondary'>Service access settings.</Typography>
                  </Box>
                </Box>
                <Divider />
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    API status
                  </Typography>
                  <StatusChip label='Enabled' color='success' />
                </Box>
                <CustomTextField label='Rate Limit' defaultValue='600 requests/min' fullWidth />
              </Stack>
            </CardContent>
          </Card>

          <Card variant='outlined'>
            <CardContent>
              <Stack spacing={4}>
                <Box className='flex items-start gap-3'>
                  <Webhook size={24} className='text-primary' />
                  <Box>
                    <Typography variant='h6'>Webhooks</Typography>
                    <Typography color='text.secondary'>Notify external systems about KB events.</Typography>
                  </Box>
                </Box>
                <Divider />
                <FormControlLabel
                  control={<Switch checked={webhooksEnabled} onChange={event => setWebhooksEnabled(event.target.checked)} />}
                  label='Enable webhooks'
                />
                <CustomTextField label='Endpoint URL' placeholder='https://example.com/kb-webhook' fullWidth />
                <CustomTextField label='Events' defaultValue='article.published, review.submitted' fullWidth multiline minRows={2} />
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </Stack>
  )
}

export default SettingsPage

