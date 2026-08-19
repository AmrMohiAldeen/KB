// MUI Imports
import type { Theme } from '@mui/material/styles'

// Type Imports
import type { Skin } from '@core/types'
import kbDesignTokens from './designTokens'

const colorSchemes = (skin: Skin): Theme['colorSchemes'] => {
  return {
    light: {
      palette: {
        primary: {
          main: kbDesignTokens.color.brand.main,
          light: kbDesignTokens.color.brand.light,
          dark: kbDesignTokens.color.brand.dark,
          lighterOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.38)'
        },
        secondary: {
          main: kbDesignTokens.color.semantic.neutral.main,
          light: kbDesignTokens.color.semantic.neutral.light,
          dark: kbDesignTokens.color.semantic.neutral.dark,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.38)'
        },
        error: {
          main: kbDesignTokens.color.semantic.error.main,
          light: kbDesignTokens.color.semantic.error.light,
          dark: kbDesignTokens.color.semantic.error.dark,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.38)'
        },
        warning: {
          main: kbDesignTokens.color.semantic.warning.main,
          light: kbDesignTokens.color.semantic.warning.light,
          dark: kbDesignTokens.color.semantic.warning.dark,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.38)'
        },
        info: {
          main: kbDesignTokens.color.semantic.info.main,
          light: kbDesignTokens.color.semantic.info.light,
          dark: kbDesignTokens.color.semantic.info.dark,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.38)'
        },
        success: {
          main: kbDesignTokens.color.semantic.success.main,
          light: kbDesignTokens.color.semantic.success.light,
          dark: kbDesignTokens.color.semantic.success.dark,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.38)'
        },
        text: {
          primary: kbDesignTokens.color.light.heading,
          secondary: kbDesignTokens.color.light.secondary,
          disabled: kbDesignTokens.color.light.disabled,
          primaryChannel: 'var(--mui-mainColorChannels-light)',
          secondaryChannel: 'var(--mui-mainColorChannels-light)'
        },
        divider: kbDesignTokens.color.light.border,
        dividerChannel: 'var(--mui-mainColorChannels-light)',
        background: {
          default: skin === 'bordered' ? kbDesignTokens.color.light.surface : kbDesignTokens.color.light.background,
          paper: kbDesignTokens.color.light.surface,
          paperChannel: '255 255 255'
        },
        action: {
          active: kbDesignTokens.color.light.secondary,
          hover: `rgb(var(--mui-mainColorChannels-light) / 0.06)`,
          selected: kbDesignTokens.color.light.selected,
          disabled: kbDesignTokens.color.light.disabled,
          disabledBackground: kbDesignTokens.color.light.surfaceSubtle,
          focus: `rgb(var(--mui-mainColorChannels-light) / 0.1)`,
          focusOpacity: 0.1,
          activeChannel: 'var(--mui-mainColorChannels-light)',
          selectedChannel: 'var(--mui-mainColorChannels-light)'
        },
        Alert: {
          errorColor: 'var(--mui-palette-error-main)',
          warningColor: 'var(--mui-palette-warning-main)',
          infoColor: 'var(--mui-palette-info-main)',
          successColor: 'var(--mui-palette-success-main)',
          errorStandardBg: 'var(--mui-palette-error-lightOpacity)',
          warningStandardBg: 'var(--mui-palette-warning-lightOpacity)',
          infoStandardBg: 'var(--mui-palette-info-lightOpacity)',
          successStandardBg: 'var(--mui-palette-success-lightOpacity)',
          errorFilledColor: 'var(--mui-palette-error-contrastText)',
          warningFilledColor: 'var(--mui-palette-warning-contrastText)',
          infoFilledColor: 'var(--mui-palette-info-contrastText)',
          successFilledColor: 'var(--mui-palette-success-contrastText)',
          errorFilledBg: 'var(--mui-palette-error-main)',
          warningFilledBg: 'var(--mui-palette-warning-main)',
          infoFilledBg: 'var(--mui-palette-info-main)',
          successFilledBg: 'var(--mui-palette-success-main)'
        },
        Avatar: {
          defaultBg: '#EEEDF0'
        },
        Chip: {
          defaultBorder: 'var(--mui-palette-divider)'
        },
        FilledInput: {
          bg: 'var(--mui-palette-action-hover)',
          hoverBg: 'var(--mui-palette-action-selected)',
          disabledBg: 'var(--mui-palette-action-hover)'
        },
        SnackbarContent: {
          bg: '#2F2B3D',
          color: 'var(--mui-palette-background-paper)'
        },
        Switch: {
          defaultColor: 'var(--mui-palette-common-white)',
          defaultDisabledColor: 'var(--mui-palette-common-white)',
          primaryDisabledColor: 'var(--mui-palette-common-white)',
          secondaryDisabledColor: 'var(--mui-palette-common-white)',
          errorDisabledColor: 'var(--mui-palette-common-white)',
          warningDisabledColor: 'var(--mui-palette-common-white)',
          infoDisabledColor: 'var(--mui-palette-common-white)',
          successDisabledColor: 'var(--mui-palette-common-white)'
        },
        Tooltip: {
          bg: '#2F2B3D'
        },
        TableCell: {
          border: 'var(--mui-palette-divider)'
        },
        customColors: {
          bodyBg: kbDesignTokens.color.light.background,
          chatBg: kbDesignTokens.color.light.surfaceSubtle,
          greyLightBg: kbDesignTokens.color.light.surfaceSubtle,
          inputBorder: kbDesignTokens.color.light.border,
          tableHeaderBg: kbDesignTokens.color.light.surfaceSubtle,
          tooltipText: kbDesignTokens.color.light.surface,
          trackBg: kbDesignTokens.color.light.border,
          surfaceSubtle: kbDesignTokens.color.light.surfaceSubtle,
          selectedBg: kbDesignTokens.color.light.selected
        }
      }
    },
    dark: {
      palette: {
        primary: {
          main: kbDesignTokens.color.brand.main,
          light: kbDesignTokens.color.brand.light,
          dark: kbDesignTokens.color.brand.dark,
          lighterOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-primary-mainChannel) / 0.38)'
        },
        secondary: {
          main: kbDesignTokens.color.semantic.neutral.light,
          light: '#B7C0CE',
          dark: kbDesignTokens.color.semantic.neutral.main,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.38)'
        },
        error: {
          main: kbDesignTokens.color.semantic.error.light,
          light: '#EE7A7A',
          dark: kbDesignTokens.color.semantic.error.main,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-error-mainChannel) / 0.38)'
        },
        warning: {
          main: '#E89A35',
          light: '#F0B866',
          dark: kbDesignTokens.color.semantic.warning.main,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-warning-mainChannel) / 0.38)'
        },
        info: {
          main: '#A996E6',
          light: '#C0B2EB',
          dark: kbDesignTokens.color.semantic.info.main,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-info-mainChannel) / 0.38)'
        },
        success: {
          main: '#54B979',
          light: '#7DCA99',
          dark: kbDesignTokens.color.semantic.success.main,
          contrastText: '#FFF',
          lighterOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.08)',
          lightOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.16)',
          mainOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.24)',
          darkOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.32)',
          darkerOpacity: 'rgb(var(--mui-palette-success-mainChannel) / 0.38)'
        },
        text: {
          primary: kbDesignTokens.color.dark.heading,
          secondary: kbDesignTokens.color.dark.secondary,
          disabled: kbDesignTokens.color.dark.disabled,
          primaryChannel: 'var(--mui-mainColorChannels-dark)',
          secondaryChannel: 'var(--mui-mainColorChannels-dark)'
        },
        divider: kbDesignTokens.color.dark.border,
        dividerChannel: 'var(--mui-mainColorChannels-dark)',
        background: {
          default: skin === 'bordered' ? kbDesignTokens.color.dark.surface : kbDesignTokens.color.dark.background,
          paper: kbDesignTokens.color.dark.surface,
          paperChannel: '32 38 56'
        },
        action: {
          active: kbDesignTokens.color.dark.secondary,
          hover: `rgb(var(--mui-mainColorChannels-dark) / 0.06)`,
          selected: kbDesignTokens.color.dark.selected,
          disabled: kbDesignTokens.color.dark.disabled,
          disabledBackground: kbDesignTokens.color.dark.surfaceSubtle,
          focus: `rgb(var(--mui-mainColorChannels-dark) / 0.1)`,
          focusOpacity: 0.1,
          activeChannel: 'var(--mui-mainColorChannels-dark)',
          selectedChannel: 'var(--mui-mainColorChannels-dark)'
        },
        Alert: {
          errorColor: 'var(--mui-palette-error-main)',
          warningColor: 'var(--mui-palette-warning-main)',
          infoColor: 'var(--mui-palette-info-main)',
          successColor: 'var(--mui-palette-success-main)',
          errorStandardBg: 'var(--mui-palette-error-lightOpacity)',
          warningStandardBg: 'var(--mui-palette-warning-lightOpacity)',
          infoStandardBg: 'var(--mui-palette-info-lightOpacity)',
          successStandardBg: 'var(--mui-palette-success-lightOpacity)',
          errorFilledColor: 'var(--mui-palette-error-contrastText)',
          warningFilledColor: 'var(--mui-palette-warning-contrastText)',
          infoFilledColor: 'var(--mui-palette-info-contrastText)',
          successFilledColor: 'var(--mui-palette-success-contrastText)',
          errorFilledBg: 'var(--mui-palette-error-main)',
          warningFilledBg: 'var(--mui-palette-warning-main)',
          infoFilledBg: 'var(--mui-palette-info-main)',
          successFilledBg: 'var(--mui-palette-success-main)'
        },
        Avatar: {
          defaultBg: '#373B50'
        },
        Chip: {
          defaultBorder: 'var(--mui-palette-divider)'
        },
        FilledInput: {
          bg: 'var(--mui-palette-action-hover)',
          hoverBg: 'var(--mui-palette-action-selected)',
          disabledBg: `var(--mui-palette-action-hover)`
        },
        SnackbarContent: {
          bg: '#F7F4FF',
          color: 'var(--mui-palette-background-paper)'
        },
        Switch: {
          defaultColor: 'var(--mui-palette-common-white)',
          defaultDisabledColor: 'var(--mui-palette-common-white)',
          primaryDisabledColor: 'var(--mui-palette-common-white)',
          secondaryDisabledColor: 'var(--mui-palette-common-white)',
          errorDisabledColor: 'var(--mui-palette-common-white)',
          warningDisabledColor: 'var(--mui-palette-common-white)',
          infoDisabledColor: 'var(--mui-palette-common-white)',
          successDisabledColor: 'var(--mui-palette-common-white)'
        },
        Tooltip: {
          bg: '#F7F4FF'
        },
        TableCell: {
          border: 'var(--mui-palette-divider)'
        },
        customColors: {
          bodyBg: kbDesignTokens.color.dark.background,
          chatBg: kbDesignTokens.color.dark.surfaceSubtle,
          greyLightBg: kbDesignTokens.color.dark.surfaceSubtle,
          inputBorder: kbDesignTokens.color.dark.border,
          tableHeaderBg: kbDesignTokens.color.dark.surfaceSubtle,
          tooltipText: kbDesignTokens.color.dark.heading,
          trackBg: kbDesignTokens.color.dark.border,
          surfaceSubtle: kbDesignTokens.color.dark.surfaceSubtle,
          selectedBg: kbDesignTokens.color.dark.selected
        }
      }
    }
  } as Theme['colorSchemes']
}

export default colorSchemes
