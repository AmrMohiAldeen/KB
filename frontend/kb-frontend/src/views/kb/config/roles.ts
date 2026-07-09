// Type Imports
import type { KbUserRole } from '@/types/apps/userTypes'
import type { PermissionDefinition, RoleDefinition } from '../types/roles'

export const roleLabels: Record<KbUserRole, string> = {
  admin: 'Admin',
  author: 'Author',
  reviewer: 'Reviewer',
  contributor: 'Contributor',
  viewer: 'Viewer'
}

export const roleDefinitions: RoleDefinition[] = [
  {
    role: 'admin',
    label: 'Admin',
    summary: 'Full KB administration and publishing control.',
    permissions: [
      'articles.create',
      'articles.editOwnDraft',
      'articles.editAnyDraft',
      'articles.submitForReview',
      'articles.review',
      'articles.publish',
      'articles.delete',
      'comments.create',
      'suggestions.create',
      'categories.manage',
      'templates.manage',
      'versions.view',
      'versions.restore',
      'auditLogs.view',
      'locks.manage',
      'users.manage',
      'roles.manage'
    ]
  },
  {
    role: 'author',
    label: 'Author',
    summary: 'Create and maintain article drafts.',
    permissions: [
      'articles.create',
      'articles.editOwnDraft',
      'articles.submitForReview',
      'comments.create',
      'suggestions.create',
      'versions.view'
    ]
  },
  {
    role: 'reviewer',
    label: 'Reviewer',
    summary: 'Review submissions and publish approved content.',
    permissions: [
      'articles.create',
      'articles.editOwnDraft',
      'articles.submitForReview',
      'articles.review',
      'articles.publish',
      'comments.create',
      'suggestions.create',
      'versions.view',
      'versions.restore'
    ]
  },
  {
    role: 'contributor',
    label: 'Contributor',
    summary: 'Suggest and draft content with limited workflow access.',
    permissions: ['articles.create', 'articles.editOwnDraft', 'articles.submitForReview', 'suggestions.create']
  },
  {
    role: 'viewer',
    label: 'Viewer',
    summary: 'Read published and internal KB content.',
    permissions: ['comments.create', 'suggestions.create', 'versions.view']
  }
]

export const permissionDefinitions: PermissionDefinition[] = [
  { key: 'articles.create', label: 'Create articles', description: 'Create new article drafts.' },
  { key: 'articles.editOwnDraft', label: 'Edit own drafts', description: 'Edit drafts owned by the user.' },
  { key: 'articles.editAnyDraft', label: 'Edit any draft', description: 'Edit drafts owned by any KB user.' },
  { key: 'articles.submitForReview', label: 'Submit for review', description: 'Move a draft into review.' },
  { key: 'articles.review', label: 'Review articles', description: 'Approve, reject, or request changes.' },
  { key: 'articles.publish', label: 'Publish articles', description: 'Publish approved article versions.' },
  { key: 'articles.delete', label: 'Delete articles', description: 'Delete drafts or archive article records.' },
  { key: 'comments.create', label: 'Create comments', description: 'Comment on article and review discussions.' },
  { key: 'suggestions.create', label: 'Create suggestions', description: 'Submit article suggestions.' },
  { key: 'categories.manage', label: 'Manage categories', description: 'Create and edit navigation categories.' },
  { key: 'templates.manage', label: 'Manage templates', description: 'Create and update article templates.' },
  { key: 'versions.view', label: 'View versions', description: 'View article version history.' },
  { key: 'versions.restore', label: 'Restore versions', description: 'Restore a prior article version.' },
  { key: 'auditLogs.view', label: 'View audit logs', description: 'Read audit activity.' },
  { key: 'locks.manage', label: 'Manage locks', description: 'Lock and unlock article drafts.' },
  { key: 'users.manage', label: 'Manage users', description: 'Manage SSO user access.' },
  { key: 'roles.manage', label: 'Manage roles', description: 'Manage global role permissions.' }
]
