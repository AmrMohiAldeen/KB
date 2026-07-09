// Type Imports
import type { KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { KbUserRole, UsersType } from '@/types/apps/userTypes'

const compareUsers = (sort: KbDataTableSort) => (a: UsersType, b: UsersType) => {
  const direction = sort.direction === 'asc' ? 1 : -1
  const aValue = String(a[sort.columnId as keyof UsersType] ?? '')
  const bValue = String(b[sort.columnId as keyof UsersType] ?? '')

  return aValue.localeCompare(bValue) * direction
}

export const getVisibleUsers = ({
  users,
  roleFilter,
  search,
  sort
}: {
  users: UsersType[]
  roleFilter: KbUserRole | 'all'
  search: string
  sort: KbDataTableSort
}) => {
  const needle = search.trim().toLowerCase()

  return [...users]
    .filter(user => (roleFilter === 'all' ? true : user.role === roleFilter))
    .filter(user =>
      needle ? `${user.fullName} ${user.email} ${user.role} ${user.ssoId}`.toLowerCase().includes(needle) : true
    )
    .sort(compareUsers(sort))
}
