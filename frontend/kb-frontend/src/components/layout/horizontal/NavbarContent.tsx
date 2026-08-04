'use client'

// Third-party Imports
import classnames from 'classnames'

// Component Imports
import NavToggle from './NavToggle'
import Logo from '@components/layout/shared/Logo'
import NavSearch from '@components/layout/shared/search'
import LanguageDropdown from '@components/layout/shared/LanguageDropdown'
import ModeDropdown from '@components/layout/shared/ModeDropdown'
import NotificationsDropdown from '@components/layout/shared/NotificationsDropdown'
import UserDropdown from '@components/layout/shared/UserDropdown'

// Hook Imports
import useHorizontalNav from '@menu/hooks/useHorizontalNav'

// Util Imports
import { horizontalLayoutClasses } from '@layouts/utils/layoutClasses'

const NavbarContent = ({ accessToken }: { accessToken: string }) => {
  // Hooks
  const { isBreakpointReached } = useHorizontalNav()

  return (
    <div className={classnames(horizontalLayoutClasses.navbarContent, 'flex items-center justify-between gap-4 is-full')}>
      <div className='flex items-center gap-4'>
        <NavToggle />
        {!isBreakpointReached && <Logo />}
      </div>

      <div className='kb-topbar-actions flex items-center gap-1'>
        <NavSearch />
        <LanguageDropdown />
        <ModeDropdown />
        <NotificationsDropdown accessToken={accessToken} />
        <UserDropdown />
      </div>
    </div>
  )
}

export default NavbarContent
