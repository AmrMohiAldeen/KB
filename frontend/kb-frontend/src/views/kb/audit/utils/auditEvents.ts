// Type Imports
import type { KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { AuditEvent } from '../../types/audit'

export const getAuditUserOptions = (events: AuditEvent[]) => [
  'All users',
  ...Array.from(new Set(events.map(event => event.actorName)))
]

export const getAuditActionOptions = (events: AuditEvent[]) => [
  'All actions',
  ...Array.from(new Set(events.map(event => event.action)))
]

const compareAuditEvents = (sort: KbDataTableSort) => (a: AuditEvent, b: AuditEvent) => {
  const direction = sort.direction === 'asc' ? 1 : -1
  const aValue = String(a[sort.columnId as keyof AuditEvent] ?? '')
  const bValue = String(b[sort.columnId as keyof AuditEvent] ?? '')

  if (sort.columnId === 'createdAt') {
    return (new Date(aValue).getTime() - new Date(bValue).getTime()) * direction
  }

  return aValue.localeCompare(bValue) * direction
}

export const getVisibleAuditEvents = ({
  events,
  userFilter,
  actionFilter,
  articleSearch,
  sort
}: {
  events: AuditEvent[]
  userFilter: string
  actionFilter: string
  articleSearch: string
  sort: KbDataTableSort
}) => {
  const needle = articleSearch.trim().toLowerCase()

  return [...events]
    .filter(event => {
      const matchesUser = userFilter === 'All users' || event.actorName === userFilter
      const matchesAction = actionFilter === 'All actions' || event.action === actionFilter
      const matchesArticle = needle ? `${event.articleTitle} ${event.detail}`.toLowerCase().includes(needle) : true

      return matchesUser && matchesAction && matchesArticle
    })
    .sort(compareAuditEvents(sort))
}
