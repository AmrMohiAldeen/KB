// MUI Imports
import type { Theme } from '@mui/material/styles'

const chip: Theme['components'] = {
  MuiChip: {
    variants: [
      {
        props: { variant: 'tonal', color: 'primary' },
        style: {
          backgroundColor: 'var(--mui-palette-primary-lighterOpacity)',
          color: 'var(--mui-palette-primary-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-primary-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-primary-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-primary-main)'
            }
          }
        }
      },
      {
        props: { variant: 'tonal', color: 'secondary' },
        style: {
          backgroundColor: 'var(--mui-palette-secondary-lighterOpacity)',
          color: 'var(--mui-palette-secondary-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-secondary-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-secondary-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-secondary-main)'
            }
          }
        }
      },
      {
        props: { variant: 'tonal', color: 'error' },
        style: {
          backgroundColor: 'var(--mui-palette-error-lighterOpacity)',
          color: 'var(--mui-palette-error-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-error-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-error-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-error-main)'
            }
          }
        }
      },
      {
        props: { variant: 'tonal', color: 'warning' },
        style: {
          backgroundColor: 'var(--mui-palette-warning-lighterOpacity)',
          color: 'var(--mui-palette-warning-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-warning-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-warning-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-warning-main)'
            }
          }
        }
      },
      {
        props: { variant: 'tonal', color: 'info' },
        style: {
          backgroundColor: 'var(--mui-palette-info-lighterOpacity)',
          color: 'var(--mui-palette-info-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-info-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-info-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-info-main)'
            }
          }
        }
      },
      {
        props: { variant: 'tonal', color: 'success' },
        style: {
          backgroundColor: 'var(--mui-palette-success-lighterOpacity)',
          color: 'var(--mui-palette-success-main)',
          '&.Mui-focusVisible': {
            backgroundColor: 'var(--mui-palette-success-mainOpacity)'
          },
          '& .MuiChip-deleteIcon': {
            color: 'rgb(var(--mui-palette-success-mainChannel) / 0.7)',
            '&:hover': {
              color: 'var(--mui-palette-success-main)'
            }
          }
        }
      }
    ],
    styleOverrides: {
      root: ({ ownerState, theme }) => ({
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightMedium,
        lineHeight: theme.typography.body2.lineHeight,

        
        ...(ownerState.size === 'small'
          ? {
              borderRadius: 'var(--mui-shape-customBorderRadius-sm)',
              minBlockSize: 24
            }
          : {
              borderRadius: 'var(--mui-shape-borderRadius)'
            }),

        '& .MuiChip-deleteIcon': {
          ...(ownerState.size === 'small'
            ? {
                fontSize: '1rem',
                marginInlineEnd: theme.spacing(1),
                marginInlineStart: theme.spacing(-2)
              }
            : {
                fontSize: '1.25rem',
                marginInlineEnd: theme.spacing(1.5),
                marginInlineStart: theme.spacing(-2)
              })
        },
        '& .MuiChip-avatar, & .MuiChip-icon': {
          blockSize: 20,
          inlineSize: 20,
          '& i, & svg': {
            ...(ownerState.size === 'small'
              ? {
                  fontSize: 13
                }
              : {
                  fontSize: 15
                })
          },
          ...(ownerState.size === 'small'
            ? {
                marginInlineStart: theme.spacing(1),
                marginInlineEnd: theme.spacing(-2)
              }
            : {
                marginInlineStart: theme.spacing(1.5),
                marginInlineEnd: theme.spacing(-2)
              })
        },
        '&.MuiChip-sizeMedium > .MuiChip-icon': {
          fontSize: '1rem'
        },
        '&.MuiChip-sizeSmall > .MuiChip-icon': {
          fontSize: '0.875rem'
        },
        '&.Mui-disabled': {
          opacity: 0.45
        }
      }),
      label: ({ ownerState, theme }) => ({
        ...(ownerState.size === 'small'
          ? {
              paddingInline: theme.spacing(2.5),
              paddingBlock: theme.spacing(0.5)
            }
          : {
              paddingInline: theme.spacing(3)
            })
      }),
    }
  }
}

export default chip
