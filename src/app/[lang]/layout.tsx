// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { ChildrenType } from '@core/types'
import type { Locale } from '@configs/i18n'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

import { notFound } from 'next/navigation'

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'

// Util Imports
import { getMode } from '@core/utils/serverHelpers'

// Theme Imports
import {
  MUI_COLOR_SCHEME_STORAGE_KEY,
  MUI_INIT_COLOR_SCHEME_ATTRIBUTE,
  MUI_MODE_STORAGE_KEY
} from '@core/theme/colorScheme'

// Config Imports
import { i18n } from '@configs/i18n'

const isLocale = (value: string): value is Locale => i18n.locales.includes(value as Locale)

const getLangParam = async (params: Promise<unknown>) => {
  const resolvedParams = await params

  if (!resolvedParams || typeof resolvedParams !== 'object' || !('lang' in resolvedParams)) {
    notFound()
  }

  const lang = String((resolvedParams as { lang: unknown }).lang)

  if (!isLocale(lang)) notFound()

  return lang
}

export const metadata = {
  title: 'Knowledge Base',
  description: 'Company Knowledge Base platform'
}

const RootLayout = async ({ children, params }: ChildrenType & { params: Promise<unknown> }) => {
  // Vars
  const lang = await getLangParam(params)
  const direction = i18n.langDirection[lang]
  const mode = await getMode()

  return (
    <html id='__next' lang={lang} dir={direction} suppressHydrationWarning>
      <body className='flex is-full min-bs-full flex-auto flex-col'>
        <InitColorSchemeScript
          attribute={MUI_INIT_COLOR_SCHEME_ATTRIBUTE}
          defaultMode={mode}
          modeStorageKey={MUI_MODE_STORAGE_KEY}
          colorSchemeStorageKey={MUI_COLOR_SCHEME_STORAGE_KEY}
        />
        {children}
      </body>
    </html>
  )
}

export default RootLayout
