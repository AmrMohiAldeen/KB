// MUI Imports
import type { Theme } from '@mui/material/styles'

// Type Imports
import type { MenuItemStyles } from '@menu/types'
import type { Settings } from '@core/contexts/settingsContext'
import type { VerticalNavState } from '@menu/contexts/verticalNavContext'

// Util Imports
import { menuClasses } from '@menu/utils/menuClasses'

const menuItemStyles = (verticalNavOptions: VerticalNavState, theme: Theme, settings: Settings): MenuItemStyles => {
  // Vars
  const { isCollapsed, isHovered, isPopoutWhenCollapsed, transitionDuration } = verticalNavOptions

  const popoutCollapsed = isPopoutWhenCollapsed && isCollapsed
  const popoutExpanded = isPopoutWhenCollapsed && !isCollapsed
  const collapsedNotHovered = isCollapsed && !isHovered

  return {
    root: ({ level }) => ({
      ...(!isPopoutWhenCollapsed || popoutExpanded || (popoutCollapsed && level === 0)
        ? {
            marginBlockStart: theme.spacing(1.5)
          }
        : {
            marginBlockStart: 0
          }),
      [`&.${menuClasses.subMenuRoot}.${menuClasses.open} > .${menuClasses.button}, &.${menuClasses.subMenuRoot} > .${menuClasses.button}.${menuClasses.active}`]:
        {
          backgroundColor: 'var(--mui-palette-action-selected) !important'
        },
      [`&.${menuClasses.disabled} > .${menuClasses.button}`]: {
        color: 'var(--mui-palette-text-disabled)'
      },
      [`&:not(.${menuClasses.subMenuRoot}) > .${menuClasses.button}.${menuClasses.active}`]: {
        ...(popoutCollapsed && level > 0
          ? {
              backgroundColor: 'var(--mui-palette-primary-lightOpacity)',
              color: 'var(--mui-palette-primary-main)',
              [`& .${menuClasses.icon}`]: {
                color: 'var(--mui-palette-primary-main)'
              }
            }
          : {
              color: 'var(--mui-palette-primary-main)',
              backgroundColor: 'var(--mui-palette-primary-lighterOpacity) !important',
              borderInlineStart: '3px solid var(--mui-palette-primary-main)',
              boxShadow: 'none',
              [`& .${menuClasses.icon}`]: {
                color: 'inherit'
              }
            })
      }
    }),
    button: ({ level, active }) => ({
      paddingBlock: '7px',
      paddingInline: '12px',
      minBlockSize: 40,
      borderRadius: '10px',
      ...(!(isCollapsed && !isHovered) && {
        '&:has(.MuiChip-root)': {
          paddingBlock: theme.spacing(1.75)
        }
      }),

      ...((!isPopoutWhenCollapsed || popoutExpanded || (popoutCollapsed && level === 0)) && {
        borderRadius: '10px',
        transition: `padding-inline-start ${transitionDuration}ms ease-in-out`
      }),
      ...(!active && {
        '&:hover, &:focus-visible': {
          backgroundColor: 'var(--mui-palette-action-hover)'
        },
        '&[aria-expanded="true"]': {
          backgroundColor: 'var(--mui-palette-action-selected)'
        }
      })
    }),
    icon: ({ level }) => ({
      transition: `margin-inline-end ${transitionDuration}ms ease-in-out`,
      ...(level === 0 && {
        fontSize: '1.25rem'
      }),
      ...(level > 0 && {
        fontSize: '0.75rem',
        color: 'var(--mui-palette-text-secondary)'
      }),
      ...(level === 0 && {
        marginInlineEnd: theme.spacing(2)
      }),
      ...(level > 0 && {
        marginInlineEnd: theme.spacing(3.5)
      }),
      ...(level === 1 &&
        !popoutCollapsed && {
          marginInlineStart: theme.spacing(1.5)
        }),
      ...(level > 1 && {
        marginInlineStart: theme.spacing((popoutCollapsed ? 0 : 1.5) + 2.5 * (level - 1))
      }),
      ...(collapsedNotHovered && {
        marginInlineEnd: 0
      }),
      ...(popoutCollapsed &&
        level > 0 && {
          marginInlineEnd: theme.spacing(2)
        }),
      '& > i, & > svg': {
        fontSize: 'inherit'
      }
    }),
    prefix: {
      marginInlineEnd: theme.spacing(2)
    },
    label: ({ level }) => ({
      fontSize: '0.9375rem',
      fontWeight: 500,
      ...((!isPopoutWhenCollapsed || popoutExpanded || (popoutCollapsed && level === 0)) && {
        transition: `opacity ${transitionDuration}ms ease-in-out`,
        ...(collapsedNotHovered && {
          opacity: 0
        })
      })
    }),
    suffix: {
      marginInlineStart: theme.spacing(2)
    },
    subMenuExpandIcon: {
      fontSize: '1.25rem',
      marginInlineStart: theme.spacing(2),
      '& i, & svg': {
        fontSize: 'inherit'
      }
    },
    subMenuContent: ({ level }) => ({
      zIndex: 'calc(var(--drawer-z-index) + 1)',
      borderRadius: 'var(--border-radius)',
      backgroundColor: 'var(--mui-palette-background-paper)',
      ...(popoutCollapsed && {
        '& > ul, & > div > ul': {
          [`& > li:not(:last-child), & > li > .${menuClasses.button}:not(:last-child)`]: {
            marginBlockEnd: `${theme.spacing(0.5)} !important`
          }
        },
        ...(level === 0 && {
          ...(settings.skin === 'bordered'
            ? {
                boxShadow: 'none',
                border: '1px solid var(--mui-palette-divider)'
              }
            : {
                boxShadow: 'var(--mui-customShadows-sm)'
              }),
          [`& .${menuClasses.button}`]: {
            paddingInline: theme.spacing(4)
          },
          padding: theme.spacing(2)
        })
      })
    })
  }
}

export default menuItemStyles
