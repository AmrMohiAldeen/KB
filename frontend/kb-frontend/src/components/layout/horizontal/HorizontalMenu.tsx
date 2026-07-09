// Do not remove this following 'use client' else SubMenu rendered in vertical menu on smaller screen will not work.
'use client'

// Next Imports
import { useParams } from 'next/navigation'

// MUI Imports
import { useTheme } from '@mui/material/styles'

// Type Imports
import type { getDictionary } from '@/utils/getDictionary'
import type { VerticalMenuContextProps } from '@menu/components/vertical-menu/Menu'

// Component Imports
import HorizontalNav, { Menu, SubMenu, MenuItem } from '@menu/horizontal-menu'
import VerticalNavContent from './VerticalNavContent'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'
import { useSettings } from '@core/hooks/useSettings'

// Styled Component Imports
import StyledHorizontalNavExpandIcon from '@menu/styles/horizontal/StyledHorizontalNavExpandIcon'
import StyledVerticalNavExpandIcon from '@menu/styles/vertical/StyledVerticalNavExpandIcon'

// Style Imports
import menuItemStyles from '@core/styles/horizontal/menuItemStyles'
import menuRootStyles from '@core/styles/horizontal/menuRootStyles'
import verticalNavigationCustomStyles from '@core/styles/vertical/navigationCustomStyles'
import verticalMenuItemStyles from '@core/styles/vertical/menuItemStyles'
import verticalMenuSectionStyles from '@core/styles/vertical/menuSectionStyles'

type RenderExpandIconProps = {
  level?: number
}

type RenderVerticalExpandIconProps = {
  open?: boolean
  transitionDuration?: VerticalMenuContextProps['transitionDuration']
}

const RenderExpandIcon = ({ level }: RenderExpandIconProps) => (
  <StyledHorizontalNavExpandIcon level={level}>
    <i className='tabler-chevron-right' />
  </StyledHorizontalNavExpandIcon>
)

const RenderVerticalExpandIcon = ({ open, transitionDuration }: RenderVerticalExpandIconProps) => (
  <StyledVerticalNavExpandIcon open={open} transitionDuration={transitionDuration}>
    <i className='tabler-chevron-right' />
  </StyledVerticalNavExpandIcon>
)

const HorizontalMenu = ({ dictionary }: { dictionary: Awaited<ReturnType<typeof getDictionary>> }) => {
  // Hooks
  const verticalNavOptions = useVerticalNav()
  const theme = useTheme()
  const { settings } = useSettings()
  const { lang: locale } = useParams<{ lang: string }>()

  // Vars
  const { skin } = settings
  const { transitionDuration } = verticalNavOptions
  const href = (path: string) => `/${locale}${path}`
  const navigation = dictionary.navigation

  return (
    <HorizontalNav
      switchToVertical
      verticalNavContent={VerticalNavContent}
      verticalNavProps={{
        customStyles: verticalNavigationCustomStyles(verticalNavOptions, theme),
        backgroundColor:
          skin === 'bordered' ? 'var(--mui-palette-background-paper)' : 'var(--mui-palette-background-default)'
      }}
    >
      <Menu
        rootStyles={menuRootStyles(theme)}
        renderExpandIcon={({ level }) => <RenderExpandIcon level={level} />}
        menuItemStyles={menuItemStyles(settings, theme)}
        renderExpandedMenuItemIcon={{ icon: <i className='tabler-circle text-xs' /> }}
        popoutMenuOffset={{
          mainAxis: ({ level }) => (level && level > 0 ? 14 : 12),
          alignmentAxis: 0
        }}
        verticalMenuProps={{
          menuItemStyles: verticalMenuItemStyles(verticalNavOptions, theme, settings),
          renderExpandIcon: ({ open }) => <RenderVerticalExpandIcon open={open} transitionDuration={transitionDuration} />,
          renderExpandedMenuItemIcon: { icon: <i className='tabler-circle text-xs' /> },
          menuSectionStyles: verticalMenuSectionStyles(verticalNavOptions, theme)
        }}
      >
        <SubMenu label={navigation.content} icon={<i className='tabler-article' />}>
          <MenuItem href={href('/articles')} icon={<i className='tabler-article' />}>
            {navigation.articles}
          </MenuItem>
          <MenuItem href={href('/editor')} icon={<i className='tabler-pencil' />}>
            {navigation.editor}
          </MenuItem>
          <MenuItem href={href('/categories')} icon={<i className='tabler-folder' />}>
            {navigation.categories}
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
        </SubMenu>

        <SubMenu label={navigation.workflow} icon={<i className='tabler-checkup-list' />}>
          <MenuItem href={href('/review')} icon={<i className='tabler-checkup-list' />}>
            {navigation.review}
          </MenuItem>
          <MenuItem href={href('/notifications')} icon={<i className='tabler-bell' />}>
            {navigation.notifications}
          </MenuItem>
          <MenuItem href={href('/audit-logs')} icon={<i className='tabler-history' />}>
            {navigation.auditLogs}
          </MenuItem>
        </SubMenu>

        <SubMenu label={navigation.operations} icon={<i className='tabler-settings-automation' />}>
          <MenuItem href={href('/search-index')} icon={<i className='tabler-database-search' />}>
            {navigation.searchIndex}
          </MenuItem>
          <MenuItem href={href('/export-jobs')} icon={<i className='tabler-file-export' />}>
            {navigation.exportJobs}
          </MenuItem>
        </SubMenu>

        <SubMenu label={navigation.administration} icon={<i className='tabler-shield-lock' />}>
          <MenuItem href={href('/users')} icon={<i className='tabler-users' />}>
            {navigation.users}
          </MenuItem>
          <MenuItem href={href('/roles')} icon={<i className='tabler-shield-lock' />}>
            {navigation.roles}
          </MenuItem>
          <MenuItem href={href('/settings')} icon={<i className='tabler-settings' />}>
            {navigation.settings}
          </MenuItem>
        </SubMenu>
      </Menu>
    </HorizontalNav>
  )
}

export default HorizontalMenu
