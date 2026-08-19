// MUI Imports
import type { Theme, ThemeOptions } from '@mui/material/styles'

// Type Imports
import type { Settings } from '@core/contexts/settingsContext'
import type { SystemMode, Skin } from '@core/types'

// Theme Options Imports
import overrides from './overrides'
import colorSchemes from './colorSchemes'
import spacing from './spacing'
import shadows from './shadows'
import customShadows from './customShadows'
import typography from './typography'
import { MUI_COLOR_SCHEME_SELECTOR } from './colorScheme'
import kbDesignTokens from './designTokens'

const theme = (settings: Settings, mode: SystemMode, direction: Theme['direction']): ThemeOptions => {
  return {
    direction,
    cssVariables: {
      colorSchemeSelector: MUI_COLOR_SCHEME_SELECTOR
    },
    components: overrides(settings.skin as Skin),
    colorSchemes: colorSchemes(settings.skin as Skin),
    ...spacing,
    shape: {
      borderRadius: kbDesignTokens.radius.md,
      customBorderRadius: {
        xs: kbDesignTokens.radius.xs,
        sm: kbDesignTokens.radius.sm,
        md: kbDesignTokens.radius.md,
        lg: kbDesignTokens.radius.lg,
        xl: kbDesignTokens.radius.xl
      }
    },
    shadows: shadows(mode),
    typography: typography(''),
    customShadows: customShadows(mode),
    mainColorChannels: {
      light: '23 32 51',
      dark: '241 245 249',
      lightShadow: '23 32 51',
      darkShadow: '15 23 42'
    }
  }
}

export default theme
