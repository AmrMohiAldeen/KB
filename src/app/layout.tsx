// Third-party Imports
import 'react-perfect-scrollbar/dist/css/styles.css'

// Type Imports
import type { ChildrenType } from '@core/types'

// Style Imports
import '@/app/globals.css'

// Generated Icon CSS Imports
import '@assets/iconify-icons/generated-icons.css'

// Font Imports
import { Inter, Roboto, EB_Garamond } from 'next/font/google'

import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'

// Util Imports
import { getMode } from '@core/utils/serverHelpers'

// Theme Imports
import {
  MUI_COLOR_SCHEME_STORAGE_KEY,
  MUI_INIT_COLOR_SCHEME_ATTRIBUTE,
  MUI_MODE_STORAGE_KEY
} from '@core/theme/colorScheme'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap'
})

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap'
})

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-eb-garamond',
  display: 'swap'
})

export const metadata = {
  title: 'Knowledge Base',
  description: 'Company Knowledge Base platform'
}

const RootLayout = async ({ children }: ChildrenType) => {
  // Vars
  const direction = 'ltr'
  const mode = await getMode()

  return (
    <html
      id='__next'
      lang='en'
      dir={direction}
      suppressHydrationWarning
      className={`${inter.variable} ${roboto.variable} ${ebGaramond.variable}`}
    >
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
