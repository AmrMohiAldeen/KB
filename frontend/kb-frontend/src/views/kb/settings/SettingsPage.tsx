'use client'

// React Imports
import { useCallback, useEffect, useState } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { KeyRound, Save, ShieldCheck, UploadCloud, Webhook } from 'lucide-react'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbFormSection from '@/views/shared/forms/KbFormSection'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import { createLanguage, disableLanguage, enableLanguage, getLanguages, setDefaultLanguage } from '@/lib/api/languagesApi'
import { describeApiError } from '@/lib/api/http'
import type { LanguageResponse } from '@/types/apps/translationTypes'

const SettingsPage = ({ accessToken }: { accessToken: string }) => {
  // States
  const [reviewRequired, setReviewRequired] = useState(true)
  const [publicSearch, setPublicSearch] = useState(true)
  const [webhooksEnabled, setWebhooksEnabled] = useState(false)
  const [languages, setLanguages] = useState<LanguageResponse[]>([])
  const [languageErrors, setLanguageErrors] = useState<string[]>([])
  const [loadingLanguages, setLoadingLanguages] = useState(true)
  const [savingLanguage, setSavingLanguage] = useState(false)
  const [localeCode, setLocaleCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [nativeName, setNativeName] = useState('')
  const [isRtl, setIsRtl] = useState(false)

  const loadLanguages = useCallback(async (signal?: AbortSignal) => {
    const values = await getLanguages(accessToken, signal)
    setLanguages(values)
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    void getLanguages(accessToken, controller.signal)
      .then(values => setLanguages(values))
      .catch(error => setLanguageErrors(describeApiError(error)))
      .finally(() => setLoadingLanguages(false))
    return () => controller.abort()
  }, [accessToken])

  const addLanguage = async () => {
    if (savingLanguage || !localeCode.trim() || !displayName.trim() || !nativeName.trim()) return
    setSavingLanguage(true)
    setLanguageErrors([])
    try {
      const created = await createLanguage({
        localeCode: localeCode.trim(), displayName: displayName.trim(), nativeName: nativeName.trim(),
        isRtl, sortOrder: languages.length
      }, accessToken)
      await enableLanguage(created.languageId, accessToken)
      setLocaleCode('')
      setDisplayName('')
      setNativeName('')
      setIsRtl(false)
      await loadLanguages()
    } catch (error) {
      setLanguageErrors(describeApiError(error))
    } finally {
      setSavingLanguage(false)
    }
  }

  const changeLanguageState = async (language: LanguageResponse) => {
    if (savingLanguage) return
    setSavingLanguage(true)
    setLanguageErrors([])
    try {
      if (language.isEnabled) await disableLanguage(language.languageId, accessToken)
      else await enableLanguage(language.languageId, accessToken)
      await loadLanguages()
    } catch (error) {
      setLanguageErrors(describeApiError(error))
    } finally {
      setSavingLanguage(false)
    }
  }

  const changeDefaultLanguage = async (languageId: string) => {
    if (!languageId || savingLanguage) return
    setSavingLanguage(true)
    setLanguageErrors([])
    try {
      await setDefaultLanguage(languageId, accessToken)
      await loadLanguages()
    } catch (error) {
      setLanguageErrors(describeApiError(error))
    } finally {
      setSavingLanguage(false)
    }
  }

  // Handlers
  const handleSave = () => {
    // TODO: connect to backend API.
    // PATCH /api/kb/settings should persist general, SSO, export, API, and webhook settings with rowVersion.
  }

  // Render
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
              <CustomTextField label='Default Language' select value={languages.find(language => language.isDefault)?.languageId ?? ''} onChange={event => void changeDefaultLanguage(event.target.value)} disabled={loadingLanguages || savingLanguage || !languages.some(language => language.isEnabled)} fullWidth>
                {languages.filter(language => language.isEnabled).map(language => <MenuItem key={language.languageId} value={language.languageId}>{language.nativeName} ({language.displayName})</MenuItem>)}
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

          <KbFormSection title='Translation languages' description='Add and enable the languages editors can select when creating article translations.'>
            <KbFormGrid>
              <CustomTextField label='Locale code' placeholder='e.g. es or pt-BR' value={localeCode} onChange={event => setLocaleCode(event.target.value)} fullWidth />
              <CustomTextField label='Display name' placeholder='e.g. Spanish' value={displayName} onChange={event => setDisplayName(event.target.value)} fullWidth />
              <CustomTextField label='Native name' placeholder='e.g. Español' value={nativeName} onChange={event => setNativeName(event.target.value)} fullWidth />
              <FormControlLabel control={<Switch checked={isRtl} onChange={event => setIsRtl(event.target.checked)} />} label='Right-to-left language' />
            </KbFormGrid>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Button variant='outlined' onClick={() => void addLanguage()} disabled={savingLanguage || !localeCode.trim() || !displayName.trim() || !nativeName.trim()}>Add and enable language</Button>
              <Typography variant='caption' color='text.secondary'>Global language settings require the Manage languages permission.</Typography>
            </Stack>
            <KbValidationSummary title='Translation languages' errors={languageErrors} />
            {loadingLanguages ? <Typography color='text.secondary'>Loading languages…</Typography> : <Stack spacing={1}>{languages.map(language => <Stack key={language.languageId} direction='row' spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><Box><Typography variant='body2' sx={{ fontWeight: 700 }}>{language.nativeName} ({language.displayName})</Typography><Typography variant='caption' color='text.secondary'>{language.localeCode}{language.isDefault ? ' · default' : ''}</Typography></Box><Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}><StatusChip label={language.isEnabled ? 'Enabled' : 'Disabled'} color={language.isEnabled ? 'success' : 'secondary'} /><Button size='small' onClick={() => void changeLanguageState(language)} disabled={savingLanguage || language.isDefault}>{language.isEnabled ? 'Disable' : 'Enable'}</Button></Stack></Stack>)}</Stack>}
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
