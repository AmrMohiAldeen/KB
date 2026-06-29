'use client'

// React Imports
import { useMemo } from 'react'

// MUI Imports
import { deepmerge } from '@mui/utils'
import { createTheme, ThemeProvider as MuiThemeProvider, lighten, darken } from '@mui/material/styles'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter'
import CssBaseline from '@mui/material/CssBaseline'
import type {} from '@mui/material/themeCssVarsAugmentation' //! Do not remove this import otherwise you will get type errors while making a production build
import type {} from '@mui/lab/themeAugmentation' //! Do not remove this import otherwise you will get type errors while making a production build

// Third-party Imports
import { useMedia } from 'react-use'
import stylisRTLPlugin from 'stylis-plugin-rtl'

// Type Imports
import type { ChildrenType, Direction, SystemMode } from '@core/types'

// Component Imports
import ModeChanger from './ModeChanger'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

// Core Theme Imports
import defaultCoreTheme from '@core/theme'
import {
  DEFAULT_THEME_MODE,
  MUI_COLOR_SCHEME_STORAGE_KEY,
  MUI_MODE_STORAGE_KEY
} from '@core/theme/colorScheme'

type Props = ChildrenType & {
  direction: Direction
  systemMode: SystemMode
}

const ThemeProvider = (props: Props) => {
  // Props
  const { children, direction, systemMode } = props

  // Hooks
  const { settings } = useSettings()
  const isDark = useMedia('(prefers-color-scheme: dark)', false)

  // Vars
  const isServer = typeof window === 'undefined'
  const mode = settings.mode ?? DEFAULT_THEME_MODE
  let currentMode: SystemMode

  if (isServer) {
    currentMode = systemMode
  } else {
    if (mode === 'system') {
      currentMode = isDark ? 'dark' : 'light'
    } else {
      currentMode = mode
    }
  }

  // Merge the primary color scheme override with the core theme
  const theme = useMemo(() => {
    const newColorScheme = {
      colorSchemes: {
        light: {
          palette: {
            primary: {
              main: settings.primaryColor,
              light: lighten(settings.primaryColor as string, 0.2),
              dark: darken(settings.primaryColor as string, 0.1)
            }
          }
        },
        dark: {
          palette: {
            primary: {
              main: settings.primaryColor,
              light: lighten(settings.primaryColor as string, 0.2),
              dark: darken(settings.primaryColor as string, 0.1)
            }
          }
        }
      }
    }

    const coreTheme = deepmerge(defaultCoreTheme(settings, currentMode, direction), newColorScheme)

    return createTheme(coreTheme)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.primaryColor, settings.skin, currentMode, direction])

  return (
    <AppRouterCacheProvider
      options={{
        enableCssLayer: true,
        ...(direction === 'rtl' && {
          key: 'rtl',
          stylisPlugins: [stylisRTLPlugin]
        })
      }}
    >
      <MuiThemeProvider
        theme={theme}
        defaultMode={mode}
        modeStorageKey={MUI_MODE_STORAGE_KEY}
        colorSchemeStorageKey={MUI_COLOR_SCHEME_STORAGE_KEY}
        disableTransitionOnChange
      >
        <>
          <ModeChanger />
          <CssBaseline />
          {children}
        </>
      </MuiThemeProvider>
    </AppRouterCacheProvider>
  )
}

export default ThemeProvider
