'use client'

// Next Imports
import { useParams } from 'next/navigation'
import type { UIEvent } from 'react'

// MUI Imports
import { useTheme } from '@mui/material/styles'

// Third-party Imports
import PerfectScrollbar from 'react-perfect-scrollbar'

// Type Imports
import type { getDictionary } from '@/utils/getDictionary'
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import { Menu, MenuItem, MenuSection } from '@menu/vertical-menu'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'
import useVerticalNav from '@menu/hooks/useVerticalNav'

// Styled Component Imports
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/vertical/menuItemStyles'
import menuSectionStyles from '@core/styles/vertical/menuSectionStyles'

type RenderExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

type Props = {
  dictionary: Awaited<ReturnType<typeof getDictionary>>
  scrollMenu: (container: HTMLElement | UIEvent<HTMLElement>, isPerfectScrollbar: boolean) => void
}

const RenderExpandIcon = ({ open, transitionDuration }: RenderExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='tabler-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const VerticalMenu = ({ dictionary, scrollMenu }: Props) => {
  // Hooks
  const theme = useTheme()
  const verticalNavOptions = useVerticalNav()
  const { settings } = useSettings()
  const { lang: locale } = useParams<{ lang: string }>()
  const { isBreakpointReached } = useVerticalNav()

  // Vars
  const { transitionDuration } = verticalNavOptions
  const ScrollWrapper = isBreakpointReached ? 'div' : PerfectScrollbar
  const href = (path: string) => `/${locale}${path}`
  const navigation = dictionary.navigation

  return (
    <ScrollWrapper
      {...(isBreakpointReached
        ? {
            className: 'bs-full overflow-y-auto overflow-x-hidden',
            onScroll: container => scrollMenu(container, false)
          }
        : {
            options: { wheelPropagation: false, suppressScrollX: true },
            onScrollY: container => scrollMenu(container, true)
          })}
    >
      <Menu
        popoutMenuOffset={{ mainAxis: 23 }}
        menuItemStyles={menuItemStyles(verticalNavOptions, theme, settings)}
        renderExpandIcon={({ open }) => <RenderExpandIcon open={open} transitionDuration={transitionDuration} />}
        renderExpandedMenuItemIcon={{ icon: <i className='tabler-circle text-xs' /> }}
        menuSectionStyles={menuSectionStyles(verticalNavOptions, theme)}
      >
        <MenuSection label={navigation.content}>
          <MenuItem href={href('/dashboard')} icon={<i className='tabler-layout-dashboard' />}>
            {navigation.dashboard}
          </MenuItem>
          <MenuItem href={href('/templates')} icon={<i className='tabler-template' />}>
            {navigation.templates}
          </MenuItem>
          <MenuItem href={href('/reusable-blocks')} icon={<i className='tabler-components' />}>
            {navigation.reusableBlocks}
          </MenuItem>
          <MenuItem href={href('/media')} icon={<i className='tabler-photo' />}>
            {navigation.media}
          </MenuItem>
        </MenuSection>

        <MenuSection label={navigation.workflow}>
          <MenuItem href={href('/review')} icon={<i className='tabler-checkup-list' />}>
            {navigation.review}
          </MenuItem>
          <MenuItem href={href('/notifications')} icon={<i className='tabler-bell' />}>
            {navigation.notifications}
          </MenuItem>
          <MenuItem href={href('/audit-logs')} icon={<i className='tabler-history' />}>
            {navigation.auditLogs}
          </MenuItem>
        </MenuSection>

        <MenuSection label={navigation.operations}>
          <MenuItem href={href('/kb/migration/helpjuice')} icon={<i className='tabler-file-import' />}>
            {navigation.helpJuiceMigration}
          </MenuItem>
        </MenuSection>

        <MenuSection label={navigation.administration}>
          <MenuItem href={href('/users')} icon={<i className='tabler-users' />}>
            {navigation.users}
          </MenuItem>
          <MenuItem href={href('/roles')} icon={<i className='tabler-shield-lock' />}>
            {navigation.roles}
          </MenuItem>
          <MenuItem href={href('/settings')} icon={<i className='tabler-settings' />}>
            {navigation.settings}
          </MenuItem>
        </MenuSection>
      </Menu>
    </ScrollWrapper>
  )
}

export default VerticalMenu
