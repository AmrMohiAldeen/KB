import type { PagedUserResponse, UserListQuery, UserRoleSummary } from '@/types/apps/userTypes'
import { apiRequest, describeApiError } from './http'

export const getUsers = (query: UserListQuery, accessToken: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sortBy: query.sortBy,
    sortDirection: query.sortDirection
  })

  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.role) params.set('role', query.role)
  if (query.status) params.set('status', query.status)

  return apiRequest<PagedUserResponse>(`/api/users?${params.toString()}`, accessToken, { signal })
}

export const getUserRoles = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<UserRoleSummary[]>('/api/users/roles', accessToken, { signal })

export const describeUsersApiError = (error: unknown): string[] =>
  describeApiError(error).map(message =>
    message === 'You do not have permission to perform this action.'
      ? 'You do not have permission to manage users.'
      : message
  )
