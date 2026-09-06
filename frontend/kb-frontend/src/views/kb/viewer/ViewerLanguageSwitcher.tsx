'use client'

import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useRouter } from 'next/navigation'

import type { ViewerLanguage } from '@/lib/api/viewerKnowledgeBaseApi'
import { persistViewerLocale } from './viewerLocaleRouting'
import { getViewerMessages } from './viewerMessages'

export default function ViewerLanguageSwitcher({
  activeLocale,
  languages,
  getTarget
}: {
  activeLocale: string
  languages: ViewerLanguage[]
  getTarget: (language: ViewerLanguage) => string
}) {
  const router = useRouter()
  const messages = getViewerMessages(activeLocale)

  if (languages.length < 2) return null

  return <TextField
    select
    size='small'
    label={messages.language}
    value={activeLocale}
    onChange={event => {
      const language = languages.find(item => item.localeCode === event.target.value)
      if (!language) return
      persistViewerLocale(language.localeCode)
      router.push(getTarget(language))
    }}
    slotProps={{ htmlInput: { 'aria-label': messages.languageSelector } }}
    sx={{ minInlineSize: 170, alignSelf: 'flex-end' }}
  >
    {languages.map(language => <MenuItem key={language.localeCode} value={language.localeCode}>
      {language.nativeName} ({language.displayName})
    </MenuItem>)}
  </TextField>
}
