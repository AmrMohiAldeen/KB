// Type Imports
import type { VerticalMenuDataType } from '@/types/menuTypes'
import type { getDictionary } from '@/utils/getDictionary'

type Params = {
  [key: string]: string | string[] | undefined
}

const getLang = (params: Params) => {
  const lang = params.lang

  return Array.isArray(lang) ? lang[0] : lang || 'en'
}

const localizedHref = (params: Params, path: string) => `/${getLang(params)}${path}`

const verticalMenuData = (
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
  params: Params
): VerticalMenuDataType[] => {
  const navigation = dictionary.navigation

  return [
    {
      label: navigation.content,
      isSection: true,
      children: [
        { label: navigation.dashboard, icon: 'tabler-layout-dashboard', href: localizedHref(params, '/dashboard') },
        { label: navigation.templates, icon: 'tabler-template', href: localizedHref(params, '/templates') },
        {
          label: navigation.reusableBlocks,
          icon: 'tabler-components',
          href: localizedHref(params, '/reusable-blocks')
        },
        { label: navigation.media, icon: 'tabler-photo', href: localizedHref(params, '/media') }
      ]
    },
    {
      label: navigation.workflow,
      isSection: true,
      children: [
        { label: navigation.review, icon: 'tabler-checkup-list', href: localizedHref(params, '/review') },
        { label: navigation.notifications, icon: 'tabler-bell', href: localizedHref(params, '/notifications') },
        { label: navigation.auditLogs, icon: 'tabler-history', href: localizedHref(params, '/audit-logs') }
      ]
    },
    {
      label: navigation.operations,
      isSection: true,
      children: [
        {
          label: navigation.helpJuiceMigration,
          icon: 'tabler-file-import',
          href: localizedHref(params, '/kb/migration/helpjuice')
        },
        { label: navigation.searchIndex, icon: 'tabler-database-search', href: localizedHref(params, '/search-index') },
        { label: navigation.exportJobs, icon: 'tabler-file-export', href: localizedHref(params, '/export-jobs') }
      ]
    },
    {
      label: navigation.administration,
      isSection: true,
      children: [
        { label: navigation.users, icon: 'tabler-users', href: localizedHref(params, '/users') },
        { label: navigation.roles, icon: 'tabler-shield-lock', href: localizedHref(params, '/roles') },
        { label: navigation.settings, icon: 'tabler-settings', href: localizedHref(params, '/settings') }
      ]
    }
  ]
}

export default verticalMenuData
