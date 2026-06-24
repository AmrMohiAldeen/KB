// React Imports
import { useEffect } from 'react'

// MUI Imports
import { useColorScheme } from '@mui/material/styles'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

// Core Theme Imports
import { DEFAULT_THEME_MODE } from '@core/theme/colorScheme'

const ModeChanger = () => {
  // Hooks
  const { setMode } = useColorScheme()
  const { settings } = useSettings()

  useEffect(() => {
    setMode(settings.mode ?? DEFAULT_THEME_MODE)
  }, [settings.mode, setMode])

  return null
}

export default ModeChanger
