import type { KbSectionConfig } from './KbSectionPage'
import type { UsersType } from '@/types/apps/userTypes'

// TODO: Replace with backend API call to GET /api/kb/articles.
// Expected response: article metadata rows with id, title, status, categoryPath, owner, updatedAt, currentVersionId, draftId, contentStoragePath.
export const articlesPage: KbSectionConfig = {
  title: 'Articles',
  description: 'Manage article metadata, draft state, review status, publishing state, and stable version references.',
  entityName: 'Article management',
  primaryAction: 'New article',
  metrics: [
    { label: 'Published', value: '24', helper: 'Stable ArticleVersions' },
    { label: 'In review', value: '6', helper: 'Waiting for reviewers' },
    { label: 'Locked drafts', value: '3', helper: 'ArticleDrafts.IsLocked' },
    { label: 'Needs indexing', value: '2', helper: 'Queued Typesense updates' }
  ],
  records: [
    {
      id: 'article-1',
      title: 'Reset SSO session',
      description: 'Security / SSO',
      status: 'In review',
      statusColor: 'warning',
      owner: 'Author',
      updatedAt: '2026-06-24',
      meta: 'draft rowVersion pending'
    },
    {
      id: 'article-2',
      title: 'Publish an approved article',
      description: 'Editorial workflow',
      status: 'Published',
      statusColor: 'success',
      owner: 'Reviewer',
      updatedAt: '2026-06-22',
      meta: 'v12'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/review-queue.
// Expected response: ArticleReviewEvents joined to article metadata, assigned reviewer ids, current draft id, decision status, and timestamps.
export const reviewPage: KbSectionConfig = {
  title: 'Review dashboard',
  description: 'Track submitted drafts, reviewer decisions, comments, suggestions, and approval history.',
  entityName: 'Review queue',
  primaryAction: 'Assign reviewer',
  metrics: [
    { label: 'Awaiting review', value: '6' },
    { label: 'Changes requested', value: '4' },
    { label: 'Approved today', value: '2' },
    { label: 'Stale reviews', value: '1' }
  ],
  records: [
    {
      id: 'review-1',
      title: 'Media retention policy',
      description: 'Submitted draft with two open suggestions',
      status: 'Changes requested',
      statusColor: 'error',
      owner: 'Reviewer',
      updatedAt: '2026-06-25',
      meta: '2 suggestions'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/categories.
// Expected response: category tree nodes with id, parentId, name, slug, position, articleCount; categories must not include permission fields.
export const categoriesPage: KbSectionConfig = {
  title: 'Categories',
  description: 'Maintain the structure and navigation tree for knowledge base content.',
  entityName: 'Category tree',
  primaryAction: 'New category',
  metrics: [
    { label: 'Top-level categories', value: '7' },
    { label: 'Nested categories', value: '18' },
    { label: 'Unassigned articles', value: '3' },
    { label: 'Hidden categories', value: '0' }
  ],
  records: [
    {
      id: 'category-1',
      title: 'Security',
      description: 'Authentication, authorization, and compliance articles',
      status: 'Visible',
      statusColor: 'success',
      owner: 'Admin',
      updatedAt: '2026-06-20',
      meta: '8 articles'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/templates.
// Expected response: Templates rows with id, name, description, contentStoragePath, createdByUserId, updatedAt, and active flag.
export const templatesPage: KbSectionConfig = {
  title: 'Templates',
  description: 'Manage reusable article templates for consistent documentation structure.',
  entityName: 'Templates',
  primaryAction: 'New template',
  metrics: [
    { label: 'Active templates', value: '5' },
    { label: 'Draft templates', value: '1' },
    { label: 'Recently used', value: '3' },
    { label: 'Archived', value: '0' }
  ],
  records: [
    {
      id: 'template-1',
      title: 'How-to article',
      description: 'Problem, steps, verification, related articles',
      status: 'Active',
      statusColor: 'success',
      owner: 'Admin',
      updatedAt: '2026-06-18',
      meta: 'storage path pending'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/reusable-blocks.
// Expected response: ReusableBlocks rows with id, name, contentStoragePath, usageCount, updatedByUserId, updatedAt, and version metadata.
export const reusableBlocksPage: KbSectionConfig = {
  title: 'Reusable blocks',
  description: 'Maintain shared content blocks used across articles.',
  entityName: 'Reusable blocks',
  primaryAction: 'New block',
  metrics: [
    { label: 'Active blocks', value: '12' },
    { label: 'Used this week', value: '7' },
    { label: 'Needs review', value: '1' },
    { label: 'Retired', value: '2' }
  ],
  records: [
    {
      id: 'block-1',
      title: 'Support escalation note',
      description: 'Shared escalation wording for internal articles',
      status: 'Active',
      statusColor: 'success',
      owner: 'Author',
      updatedAt: '2026-06-21',
      meta: 'used in 9 articles'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/media.
// Expected response: MediaFiles joined to MediaReferences with id, fileName, mimeType, size, storagePath, referenceCount, uploadedByUserId, createdAt.
export const mediaPage: KbSectionConfig = {
  title: 'Media',
  description: 'Manage uploaded files and article references without treating file storage as SQL content.',
  entityName: 'Media files',
  primaryAction: 'Upload media',
  metrics: [
    { label: 'Files', value: '42' },
    { label: 'Referenced', value: '39' },
    { label: 'Unreferenced', value: '3' },
    { label: 'Storage review', value: '1' }
  ],
  records: [
    {
      id: 'media-1',
      title: 'sso-error-flow.png',
      description: 'image/png',
      status: 'Referenced',
      statusColor: 'success',
      owner: 'Contributor',
      updatedAt: '2026-06-19',
      meta: '3 articles'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/search-index-jobs.
// Expected response: SearchIndexJobs queue rows with id, articleId, targetVersionId, status, attempts, lastError, queuedAt, processedAt.
export const searchIndexPage: KbSectionConfig = {
  title: 'Search indexing',
  description: 'Monitor Typesense indexing jobs while keeping SQL and object storage as the source of truth.',
  entityName: 'Search index jobs',
  primaryAction: 'Queue reindex',
  metrics: [
    { label: 'Queued', value: '2' },
    { label: 'Processing', value: '1' },
    { label: 'Failed', value: '0' },
    { label: 'Indexed today', value: '18' }
  ],
  records: [
    {
      id: 'search-1',
      title: 'Article v12 reindex',
      description: 'Typesense document refresh',
      status: 'Queued',
      statusColor: 'info',
      owner: 'System',
      updatedAt: '2026-06-25',
      meta: 'attempt 0'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/export-jobs.
// Expected response: ExportJobs queue rows with id, requestedByUserId, articleVersionIds, format, status, fileStoragePath, queuedAt, completedAt.
export const exportJobsPage: KbSectionConfig = {
  title: 'Export jobs',
  description: 'Track exports generated from stable ArticleVersions rather than live drafts.',
  entityName: 'Export jobs',
  primaryAction: 'New export',
  metrics: [
    { label: 'Queued', value: '1' },
    { label: 'Running', value: '0' },
    { label: 'Completed today', value: '5' },
    { label: 'Failed', value: '0' }
  ],
  records: [
    {
      id: 'export-1',
      title: 'Security handbook PDF',
      description: 'PDF export from selected article versions',
      status: 'Queued',
      statusColor: 'info',
      owner: 'Admin',
      updatedAt: '2026-06-25',
      meta: '12 versions'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/audit-logs.
// Expected response: ArticleAuditLogs rows with actorUserId, entityType, entityId, action, before/after summary, ip/device metadata, and createdAt.
export const auditLogsPage: KbSectionConfig = {
  title: 'Audit logs',
  description: 'Inspect article, draft, review, publishing, role, and settings events.',
  entityName: 'Audit events',
  primaryAction: 'Export logs',
  metrics: [
    { label: 'Events today', value: '31' },
    { label: 'Publish events', value: '4' },
    { label: 'Role events', value: '1' },
    { label: 'Failed actions', value: '0' }
  ],
  records: [
    {
      id: 'audit-1',
      title: 'Article published',
      description: 'ArticleVersion promoted to published',
      status: 'Recorded',
      statusColor: 'success',
      owner: 'Reviewer',
      updatedAt: '2026-06-24',
      meta: 'article-2 v12'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/notifications.
// Expected response: Notifications rows with id, recipientUserId, type, title, body, readAt, entityType, entityId, createdAt.
export const notificationsPage: KbSectionConfig = {
  title: 'Notifications',
  description: 'Review workflow and operational notifications for KB users.',
  entityName: 'Notifications',
  primaryAction: 'Create announcement',
  metrics: [
    { label: 'Unread', value: '3' },
    { label: 'Review alerts', value: '2' },
    { label: 'Export alerts', value: '1' },
    { label: 'Index alerts', value: '0' }
  ],
  records: [
    {
      id: 'notification-1',
      title: 'Draft ready for review',
      description: 'Reset SSO session needs approval',
      status: 'Unread',
      statusColor: 'warning',
      owner: 'Reviewer',
      updatedAt: '2026-06-25',
      meta: 'article-1'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/users.
// Expected response: UsersType[] from @/types/apps/userTypes, with global roles resolved from UserRoles and no avatar, username, or social profile fields.
export const sampleUsers: UsersType[] = [
  {
    id: 'user-1',
    ssoId: 'sso-admin-1',
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'admin',
    status: 'active',
    createdAt: '2026-06-01',
    lastLoginAt: '2026-06-24T09:30:00Z'
  },
  {
    id: 'user-2',
    ssoId: 'sso-reviewer-1',
    email: 'reviewer@example.com',
    fullName: 'Reviewer User',
    role: 'reviewer',
    status: 'active',
    createdAt: '2026-06-02',
    lastLoginAt: null
  }
]

export const usersPage: KbSectionConfig = {
  title: 'Users',
  description: 'Manage SSO-backed users and global KB role assignments.',
  entityName: 'Users',
  primaryAction: 'Invite user',
  metrics: [
    { label: 'Active users', value: String(sampleUsers.filter(user => user.status === 'active').length) },
    { label: 'Admins', value: String(sampleUsers.filter(user => user.role === 'admin').length) },
    { label: 'Reviewers', value: String(sampleUsers.filter(user => user.role === 'reviewer').length) },
    { label: 'Inactive users', value: String(sampleUsers.filter(user => user.status === 'inactive').length) }
  ],
  records: sampleUsers.map(user => ({
    id: user.id,
    title: user.fullName,
    description: user.email,
    status: user.status,
    statusColor: user.status === 'active' ? 'success' : 'default',
    owner: user.role,
    updatedAt: user.lastLoginAt ?? user.createdAt,
    meta: user.ssoId
  }))
}

// TODO: Replace with backend API call to GET /api/kb/roles.
// Expected response: Roles plus RolePermissions for global roles only: Admin, Author, Reviewer, Contributor, Viewer.
export const rolesPage: KbSectionConfig = {
  title: 'Roles',
  description: 'Review global KB roles and the permissions assigned to each role.',
  entityName: 'Role permissions',
  primaryAction: 'Edit role',
  metrics: [
    { label: 'Global roles', value: '5' },
    { label: 'Permissions', value: '18' },
    { label: 'Custom roles', value: '0' },
    { label: 'Category permissions', value: '0' }
  ],
  records: [
    {
      id: 'role-admin',
      title: 'Admin',
      description: 'Full KB administration',
      status: 'System role',
      statusColor: 'primary',
      owner: 'Admin',
      updatedAt: '2026-06-01',
      meta: 'users, roles, settings'
    },
    {
      id: 'role-reviewer',
      title: 'Reviewer',
      description: 'Review, approve, and request changes',
      status: 'System role',
      statusColor: 'primary',
      owner: 'Admin',
      updatedAt: '2026-06-01',
      meta: 'reviews, comments, suggestions'
    }
  ]
}

// TODO: Replace with backend API call to GET /api/kb/settings.
// Expected response: admin settings including publishing workflow, review policy, media limits, export policy, and search/index options.
export const settingsPage: KbSectionConfig = {
  title: 'Settings',
  description: 'Configure KB-wide publishing, review, media, export, and search behavior.',
  entityName: 'Admin settings',
  primaryAction: 'Save settings',
  metrics: [
    { label: 'Review required', value: 'Yes' },
    { label: 'Autosave interval', value: '1s' },
    { label: 'Search provider', value: 'Typesense' },
    { label: 'SSO managed', value: 'Yes' }
  ],
  records: [
    {
      id: 'settings-1',
      title: 'Publishing workflow',
      description: 'Drafts require reviewer approval before publishing',
      status: 'Enabled',
      statusColor: 'success',
      owner: 'Admin',
      updatedAt: '2026-06-01',
      meta: 'global'
    }
  ]
}
