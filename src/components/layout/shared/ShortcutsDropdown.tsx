'use client'

// React Imports
import { useCallback, useState } from 'react'
import type { MouseEvent } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import Link from 'next/link'
import { useParams } from 'next/navigation'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'

// Third Party Components
import classnames from 'classnames'
import PerfectScrollbar from 'react-perfect-scrollbar'

// Type Imports
import type { Locale } from '@configs/i18n'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

export type ShortcutsType = {
  url: string
  icon: string
  title: string
  subtitle: string
}

const ScrollWrapper = ({ children, hidden }: { children: ReactNode; hidden: boolean }) => {
  if (hidden) {
    return <div className='overflow-x-hidden max-bs-[434px]'>{children}</div>
  } else {
    return (
      <PerfectScrollbar className='max-bs-[434px]' options={{ wheelPropagation: false, suppressScrollX: true }}>
        {children}
      </PerfectScrollbar>
    )
  }
}

const ShortcutsDropdown = ({ shortcuts }: { shortcuts: ShortcutsType[] }) => {
  // States
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

  // Hooks
  const hidden = useMediaQuery((theme: Theme) => theme.breakpoints.down('lg'))
  const isSmallScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const { settings } = useSettings()
  const { lang: locale } = useParams()

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleToggle = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
    setOpen(prevOpen => !prevOpen)
  }, [])

  return (
    <>
      <IconButton onClick={handleToggle} className='text-textPrimary'>
        <i className='tabler-layout-grid-add' />
      </IconButton>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        anchorEl={anchorEl}
        {...(isSmallScreen
          ? {
              className: 'is-full  !mbs-3 z-[1]',
              modifiers: [
                {
                  name: 'preventOverflow',
                  options: {
                    padding: themeConfig.layoutPadding
                  }
                }
              ]
            }
          : { className: 'is-96  !mbs-3 z-[1]' })}
      >
        {({ TransitionProps, placement }) => (
          <Fade {...TransitionProps} style={{ transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top' }}>
            <Paper className={settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg'}>
              <ClickAwayListener onClickAway={handleClose}>
                <div>
                  <div className='flex items-center justify-between plb-3 pli-4 is-full gap-2'>
                    <Typography variant='h6' className='flex-auto'>
                      Shortcuts
                    </Typography>
                  </div>
                  <Divider />
                  <ScrollWrapper hidden={hidden}>
                    <div className='grid grid-cols-2'>
                      {shortcuts.map((shortcut, index) => (
                        <div
                          key={index}
                          onClick={handleClose}
                          className='[&:not(:last-of-type):not(:nth-last-of-type(2))]:border-be odd:border-ie'
                        >
                          <Link
                            href={getLocalizedUrl(shortcut.url, locale as Locale)}
                            className='flex items-center flex-col p-6 gap-3 bs-full hover:bg-actionHover'
                          >
                            <CustomAvatar size={50} className='bg-actionSelected text-textPrimary'>
                              <i className={classnames('text-[1.625rem]', shortcut.icon)} />
                            </CustomAvatar>
                            <div className='flex flex-col items-center text-center'>
                              <Typography className='font-medium' color='text.primary'>
                                {shortcut.title}
                              </Typography>
                              <Typography variant='body2'>{shortcut.subtitle}</Typography>
                            </div>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </ScrollWrapper>
                </div>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default ShortcutsDropdown
