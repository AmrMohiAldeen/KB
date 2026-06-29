import type { NotificationsType } from '@components/layout/shared/NotificationsDropdown'
import type { ShortcutsType } from '@components/layout/shared/ShortcutsDropdown'

export const kbShortcuts: ShortcutsType[] = [
  {
    url: '/articles',
    icon: 'tabler-article',
    title: 'Articles',
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
export const kbNotifications: NotificationsType[] = [
  {
    icon: 'tabler-eye-check',
    color: 'warning',
    title: 'Draft awaiting review',
    subtitle: 'Reset SSO session needs approval',
    time: 'Today',
    read: false
  },
  {
    icon: 'tabler-file-export',
    color: 'info',
    title: 'Export queued',
    subtitle: 'Security handbook PDF is waiting',
    time: 'Today',
    read: false
  },
  {
    icon: 'tabler-database-search',
    color: 'success',
    title: 'Search index updated',
    subtitle: '18 article versions indexed',
    time: 'Yesterday',
    read: true
  }
]
