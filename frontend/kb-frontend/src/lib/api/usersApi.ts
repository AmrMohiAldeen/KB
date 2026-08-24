import type { PagedUserResponse, UserListQuery, UserRoleSummary, UsersType } from '@/types/apps/userTypes'
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

export type CreateUserPayload = {
  fullName: string
  email: string
  roleId: string
}

export const createUser = (payload: CreateUserPayload, accessToken: string) =>
  apiRequest<UsersType>('/api/users', accessToken, { method: 'POST', body: JSON.stringify(payload) })

export const changeUserRole = (userId: string, roleId: string, accessToken: string) =>
  apiRequest<UsersType>(`/api/users/${encodeURIComponent(userId)}/role`, accessToken, {
    method: 'PUT', body: JSON.stringify({ roleId })
  })

export const describeUsersApiError = (error: unknown): string[] =>
  describeApiError(error).map(message =>
    message === 'You do not have permission to perform this action.'
      ? 'You do not have permission to manage users.'
      : message
  )
