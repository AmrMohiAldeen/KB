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
      'articles.view',
      'comments.create',
      'comments.moderate',
      'suggestions.create',
      'media.upload',
      'categories.manage',
      'templates.manage',
      'versions.view',
      'versions.restore',
      'auditLogs.view',
      'locks.manage',
      'users.manage',
      'roles.manage',
      'workflow.override'
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
      'articles.view',
      'comments.create',
      'suggestions.create',
      'media.upload',
      'versions.view',
      'auditLogs.view',
    ]
  },
  {
    role: 'reviewer',
    label: 'Reviewer',
    summary: 'Review submissions and publish approved content.',
    permissions: [
      'articles.review',
      'articles.publish',
      'articles.view',
      'comments.create',
      'comments.moderate',
      'suggestions.create',
      'versions.view',
      'auditLogs.view',
      'locks.manage',
    ]
  },
  {
    role: 'contributor',
    label: 'Contributor',
    summary: 'Suggest and draft content with limited workflow access.',
    permissions: ['articles.view', 'comments.create', 'suggestions.create', 'versions.view']
  },
  {
    role: 'viewer',
    label: 'Viewer',
    summary: 'Read published and internal KB content.',
    permissions: ['articles.view',]
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
  { key: 'articles.view', label: 'View articles', description: 'Read published KB content.' },
  { key: 'comments.create', label: 'Create comments', description: 'Comment on article and review discussions.' },
  { key: 'comments.moderate', label: 'Moderate comments', description: 'Resolve or modify another user’s comment when moderation is required.' },
  { key: 'suggestions.create', label: 'Create suggestions', description: 'Submit article suggestions.' },
  { key: 'media.upload', label: 'Upload media', description: 'Upload images and other media assets.' },
  { key: 'categories.manage', label: 'Manage categories', description: 'Create and edit navigation categories.' },
  { key: 'templates.manage', label: 'Manage templates', description: 'Create and update article templates.' },
  { key: 'versions.view', label: 'View versions', description: 'View article version history.' },
  { key: 'versions.restore', label: 'Restore versions', description: 'Restore a prior article version.' },
  { key: 'auditLogs.view', label: 'View audit logs', description: 'Read audit activity.' },
  { key: 'locks.manage', label: 'Manage locks', description: 'Lock and unlock article drafts.' },
  { key: 'users.manage', label: 'Manage users', description: 'Manage SSO user access.' },
  { key: 'roles.manage',label: 'Manage roles',description: 'Configure global role permissions.'},
  { key: 'workflow.override', label: 'Override workflow', description: 'Override article review and publishing workflow states.'}
]
