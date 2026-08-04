// Config Imports
import themeConfig from '@configs/themeConfig'

// Type Imports
import type { Mode } from '@core/types'

const templateStoragePrefix = themeConfig.templateName.toLowerCase().split(' ').join('-')

export const MUI_COLOR_SCHEME_SELECTOR = 'data'
export const MUI_INIT_COLOR_SCHEME_ATTRIBUTE = MUI_COLOR_SCHEME_SELECTOR
export const MUI_MODE_STORAGE_KEY = `${templateStoragePrefix}-mui-template-mode`
export const MUI_COLOR_SCHEME_STORAGE_KEY = `${templateStoragePrefix}-mui-template-color-scheme`
export const DEFAULT_THEME_MODE: Mode = themeConfig.mode
