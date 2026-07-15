import type { KbUserRole } from './userTypes'

export type KbPermissionAction =
  | 'articles.create'
  | 'articles.editOwnDraft'
  | 'articles.editAnyDraft'
  | 'articles.submitForReview'
  | 'articles.review'
  | 'articles.requestChanges'
  | 'articles.publish'
  | 'articles.delete'
  | 'articles.view'
  | 'comments.create'
  | 'suggestions.create'
  | 'media.upload'
  | 'categories.manage'
  | 'templates.manage'
  | 'versions.view'
  | 'versions.restore'
  | 'auditLogs.view'
  | 'locks.manage'
  | 'users.manage'
  | 'roles.manage'
  | 'workflow.override'

export type RolePermissionType = {
  id: string
  role: KbUserRole
  action: KbPermissionAction
  enabled: boolean
  description: string
}
