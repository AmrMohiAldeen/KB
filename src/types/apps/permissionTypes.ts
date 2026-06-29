import type { KbUserRole } from './userTypes'

export type KbPermissionAction =
  | 'articles:create'
  | 'articles:edit'
  | 'articles:review'
  | 'articles:publish'
  | 'categories:manage'
  | 'media:manage'
  | 'templates:manage'
  | 'reusable-blocks:manage'
  | 'users:manage'
  | 'roles:manage'
  | 'audit-logs:read'
  | 'exports:manage'
  | 'search-index:manage'
  | 'settings:manage'

export type RolePermissionType = {
  id: string
  role: KbUserRole
  action: KbPermissionAction
  enabled: boolean
  description: string
}
