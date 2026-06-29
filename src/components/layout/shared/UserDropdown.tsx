'use client'

// React Imports
import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

// Next Imports
import { useParams, useRouter } from 'next/navigation'

// MUI Imports
import Button from '@mui/material/Button'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Divider from '@mui/material/Divider'
import Fade from '@mui/material/Fade'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Typography from '@mui/material/Typography'

// Type Imports
import type { Locale } from '@configs/i18n'
import type { UsersType } from '@/types/apps/userTypes'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

type DropdownCloseEvent = ReactMouseEvent<HTMLElement> | globalThis.MouseEvent | globalThis.TouchEvent

// TODO: Replace with backend API call to GET /api/kb/me.
// Expected response: UsersType for the current SSO-authenticated user, with global roles from UserRoles and no local auth credentials.
const currentUser: UsersType = {
  id: 'current-user',
  ssoId: 'sso-current-user',
  email: 'user@example.com',
  fullName: 'KB User',
  role: 'author',
  status: 'active',
  createdAt: '2026-06-01',
  lastLoginAt: null
}

const UserDropdown = () => {
  // States
  const [open, setOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)

  // Hooks
  const router = useRouter()
  const { settings } = useSettings()
  const { lang: locale } = useParams<{ lang: Locale }>()

  const handleDropdownOpen = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
    setOpen(current => !current)
  }

  const handleDropdownClose = (event?: DropdownCloseEvent, url?: string) => {
    if (url) {
      router.push(getLocalizedUrl(url, locale))
    }

    if (anchorEl && event?.target instanceof Node && anchorEl.contains(event.target)) {
      return
    }

    setOpen(false)
  }

  return (
    <>
      <IconButton onClick={handleDropdownOpen} className='text-textPrimary' aria-label='Current user'>
        <i className='tabler-user-circle' />
      </IconButton>

      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        anchorEl={anchorEl}
        className='min-is-[260px] !mbs-3 z-[1]'
      >
        {({ TransitionProps, placement }) => (
          <Fade
            {...TransitionProps}
            style={{
              transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top'
            }}
          >
            <Paper className={settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg'}>
              <ClickAwayListener onClickAway={event => handleDropdownClose(event)}>
                <MenuList>
                  <div className='flex flex-col plb-3 pli-5 gap-1' tabIndex={-1}>
                    <Typography className='font-medium' color='text.primary'>
                      {currentUser.fullName}
                    </Typography>
                    <Typography variant='caption'>{currentUser.email}</Typography>
                    <Typography variant='caption' color='text.secondary' className='capitalize'>
                      {currentUser.role}
                    </Typography>
                  </div>

                  <Divider className='mlb-1' />

                  <MenuItem className='mli-2 gap-3' onClick={event => handleDropdownClose(event, '/notifications')}>
                    <i className='tabler-bell text-[22px]' />
                    <Typography color='text.primary'>Notifications</Typography>
                  </MenuItem>

                  <MenuItem className='mli-2 gap-3' onClick={event => handleDropdownClose(event, '/settings')}>
                    <i className='tabler-settings text-[22px]' />
                    <Typography color='text.primary'>Settings</Typography>
                  </MenuItem>

                  <div className='flex items-center plb-2 pli-3'>
                    <Button fullWidth variant='outlined' size='small' disabled startIcon={<i className='tabler-shield-check' />}>
                      SSO managed
                    </Button>
                  </div>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default UserDropdown
