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

import Script from 'next/script'

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

const getColorSchemeInitScript = (defaultMode: string) => {
  const modeStorageKey = JSON.stringify(MUI_MODE_STORAGE_KEY)
  const colorSchemeStorageKey = JSON.stringify(MUI_COLOR_SCHEME_STORAGE_KEY)
  const defaultModeValue = JSON.stringify(defaultMode)

  const setter =
    MUI_INIT_COLOR_SCHEME_ATTRIBUTE === 'data'
      ? `
  node.removeAttribute('data-' + light);
  node.removeAttribute('data-' + dark);
  node.setAttribute('data-' + colorScheme, '');`
      : `
  node.setAttribute(${JSON.stringify(MUI_INIT_COLOR_SCHEME_ATTRIBUTE)}, colorScheme);`

  return `(function() {
try {
  var mode = localStorage.getItem(${modeStorageKey}) || ${defaultModeValue};
  var dark = localStorage.getItem(${colorSchemeStorageKey} + '-dark') || 'dark';
  var light = localStorage.getItem(${colorSchemeStorageKey} + '-light') || 'light';
  var colorScheme = '';
  if (mode === 'system') {
    colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? dark : light;
  }
  if (mode === 'light') {
    colorScheme = light;
  }
  if (mode === 'dark') {
    colorScheme = dark;
  }
  if (!colorScheme) {
    return;
  }
  var node = document.documentElement;
  ${setter}
} catch (e) {}
})();`
}

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
        <Script id='mui-color-scheme-init' strategy='beforeInteractive'>
          {getColorSchemeInitScript(mode)}
        </Script>
        {children}
      </body>
    </html>
  )
}

export default RootLayout
