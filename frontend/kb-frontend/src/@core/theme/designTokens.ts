/**
 * Shared visual tokens for the internal Knowledge Base application.
 *
 * Keep brand, semantic, surface, and control decisions here so feature
 * components can rely on the MUI theme instead of introducing local colors.
 */
export const kbDesignTokens = {
  controlHeight: 44,
  radius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12
  },
  color: {
    brand: {
      light: '#5B8DEF',
      main: '#2563EB',
      dark: '#1D4ED8'
    },
    light: {
      heading: '#172033',
      secondary: '#667085',
      disabled: '#98A2B3',
      border: '#E2E8F0',
      background: '#F6F8FB',
      surface: '#FFFFFF',
      surfaceSubtle: '#F8FAFC',
      selected: '#EFF6FF'
    },
    dark: {
      heading: '#F1F5F9',
      secondary: '#A7B0C0',
      disabled: '#697386',
      border: '#39445A',
      background: '#171C2C',
      surface: '#202638',
      surfaceSubtle: '#272E42',
      selected: '#1E335E'
    },
    semantic: {
      success: { light: '#3FA66A', main: '#15803D', dark: '#116530' },
      warning: { light: '#D97706', main: '#B45309', dark: '#92400E' },
      info: { light: '#8B7BC7', main: '#6750A4', dark: '#4F3D83' },
      error: { light: '#E05252', main: '#C62828', dark: '#9F2020' },
      neutral: { light: '#98A2B3', main: '#667085', dark: '#475467' }
    }
  }
} as const

export default kbDesignTokens
