import type { NotificationsType } from '@components/layout/shared/NotificationsDropdown'
import type { ShortcutsType } from '@components/layout/shared/ShortcutsDropdown'

export const kbShortcuts: ShortcutsType[] = [
  {
    url: '/dashboard',
    icon: 'tabler-layout-dashboard',
    title: 'Dashboard',
    subtitle: 'Manage content'
  },
  {
    url: '/review',
    icon: 'tabler-checkup-list',
    title: 'Review',
    subtitle: 'Approval queue'
  },
  {
    url: '/media',
    icon: 'tabler-photo',
    title: 'Media',
    subtitle: 'Files and references'
  },
  {
    url: '/users',
    icon: 'tabler-users',
    title: 'Users',
    subtitle: 'SSO role access'
  },
  {
    url: '/search-index',
    icon: 'tabler-database-search',
    title: 'Indexing',
    subtitle: 'Search jobs'
  },
  {
    url: '/export-jobs',
    icon: 'tabler-file-export',
    title: 'Exports',
    subtitle: 'Versioned exports'
  }
]

// TODO: Replace with backend API call to GET /api/kb/notifications?limit=6.
// Expected response: notification rows with id, title, body, type, readAt, entityType, entityId, and createdAt for the current SSO user.
export const kbNotifications: NotificationsType[] = []
