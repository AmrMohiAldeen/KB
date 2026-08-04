// Third-party Imports
import type { Action } from 'kbar'

export type SearchData = Action & {
  url: string
}

// TODO: Replace with backend API call to GET /api/kb/search/navigation.
// Expected response: searchable KB navigation actions plus recent articles/templates the current SSO user may access; Typesense remains an index, not source of truth.
const data: SearchData[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    url: '/dashboard',
    icon: 'tabler-layout-dashboard',
    section: 'Content'
  },
  {
    id: 'editor',
    name: 'Article Editor',
    url: '/editor',
    icon: 'tabler-pencil',
    section: 'Content'
  },
  {
    id: 'review',
    name: 'Review Dashboard',
    url: '/review',
    icon: 'tabler-checkup-list',
    section: 'Workflow'
  },
  {
    id: 'templates',
    name: 'Templates',
    url: '/templates',
    icon: 'tabler-template',
    section: 'Content'
  },
  {
    id: 'reusable-blocks',
    name: 'Reusable Blocks',
    url: '/reusable-blocks',
    icon: 'tabler-components',
    section: 'Content'
  },
  {
    id: 'media',
    name: 'Media',
    url: '/media',
    icon: 'tabler-photo',
    section: 'Content'
  },
  {
    id: 'search-index',
    name: 'Search Index Jobs',
    url: '/search-index',
    icon: 'tabler-database-search',
    section: 'Operations'
  },
  {
    id: 'export-jobs',
    name: 'Export Jobs',
    url: '/export-jobs',
    icon: 'tabler-file-export',
    section: 'Operations'
  },
  {
    id: 'audit-logs',
    name: 'Audit Logs',
    url: '/audit-logs',
    icon: 'tabler-history',
    section: 'Administration'
  },
  {
    id: 'users',
    name: 'Users',
    url: '/users',
    icon: 'tabler-users',
    section: 'Administration'
  },
  {
    id: 'roles',
    name: 'Roles',
    url: '/roles',
    icon: 'tabler-shield-lock',
    section: 'Administration'
  },
  {
    id: 'notifications',
    name: 'Notifications',
    url: '/notifications',
    icon: 'tabler-bell',
    section: 'Workflow'
  },
  {
    id: 'settings',
    name: 'Settings',
    url: '/settings',
    icon: 'tabler-settings',
    section: 'Administration'
  }
]

export default data
