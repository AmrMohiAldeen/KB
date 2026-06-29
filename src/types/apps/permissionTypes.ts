import type { KbUserRole } from './userTypes'

export type KbPermissionAction =
  | 'articles.create'
  | 'articles.editOwnDraft'
  | 'articles.editAnyDraft'
  | 'articles.submitForReview'
  | 'articles.review'
  | 'articles.publish'
  | 'articles.delete'
  | 'comments.create'
  | 'suggestions.create'
  | 'categories.manage'
  | 'templates.manage'
  | 'versions.view'
  | 'versions.restore'
  | 'auditLogs.view'
  | 'locks.manage'
  | 'users.manage'
  | 'roles.manage'

export type RolePermissionType = {
  id: string
  role: KbUserRole
  action: KbPermissionAction
  enabled: boolean
  description: string
}
