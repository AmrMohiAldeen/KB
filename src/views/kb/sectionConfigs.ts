import type { KbSectionConfig } from './KbSectionPage'

// Static page shell configuration only. Data rows load from backend APIs later.
export const articlesPage: KbSectionConfig = {
  title: 'Articles',
  description: 'Manage article metadata, draft state, review status, publishing state, and stable version references.',
  entityName: 'Article management',
  primaryAction: 'New article',
  emptyTitle: 'No articles loaded',
  emptyBody: 'Articles will appear here once the backend article API is connected.'
}

export const reviewPage: KbSectionConfig = {
  title: 'Review dashboard',
  description: 'Track submitted drafts, reviewer decisions, comments, suggestions, and approval history.',
  entityName: 'Review queue',
  primaryAction: 'Assign reviewer',
  emptyTitle: 'No review items loaded',
  emptyBody: 'Submitted drafts and review workflow events will appear here after the review API is connected.'
}

export const categoriesPage: KbSectionConfig = {
  title: 'Categories',
  description: 'Maintain the structure and navigation tree for knowledge base content.',
  entityName: 'Category tree',
  primaryAction: 'New category',
  emptyTitle: 'No categories loaded',
  emptyBody: 'Categories will appear here after the category API is connected.'
}

export const templatesPage: KbSectionConfig = {
  title: 'Templates',
  description: 'Manage reusable article templates for consistent documentation structure.',
  entityName: 'Templates',
  primaryAction: 'New template',
  emptyTitle: 'No templates loaded',
  emptyBody: 'Article templates will appear here after the templates API is connected.'
}

export const reusableBlocksPage: KbSectionConfig = {
  title: 'Reusable blocks',
  description: 'Maintain shared content blocks used across articles.',
  entityName: 'Reusable blocks',
  primaryAction: 'New block',
  emptyTitle: 'No reusable blocks loaded',
  emptyBody: 'Reusable content blocks will appear here after the reusable blocks API is connected.'
}

export const mediaPage: KbSectionConfig = {
  title: 'Media',
  description: 'Manage uploaded files and article references without treating file storage as SQL content.',
  entityName: 'Media files',
  primaryAction: 'Upload media',
  emptyTitle: 'No media loaded',
  emptyBody: 'Uploaded media files will appear here after the media API is connected.'
}

export const searchIndexPage: KbSectionConfig = {
  title: 'Search indexing',
  description: 'Monitor Typesense indexing jobs while keeping SQL and object storage as the source of truth.',
  entityName: 'Search index jobs',
  primaryAction: 'Queue reindex',
  emptyTitle: 'No indexing jobs loaded',
  emptyBody: 'Search indexing jobs will appear here after the search index API is connected.'
}

export const exportJobsPage: KbSectionConfig = {
  title: 'Export jobs',
  description: 'Track exports generated from stable article versions rather than live drafts.',
  entityName: 'Export jobs',
  primaryAction: 'New export',
  emptyTitle: 'No export jobs loaded',
  emptyBody: 'Export jobs will appear here after the export API is connected.'
}

export const auditLogsPage: KbSectionConfig = {
  title: 'Audit logs',
  description: 'Inspect article, draft, review, publishing, role, and settings events.',
  entityName: 'Audit events',
  primaryAction: 'Export logs',
  emptyTitle: 'No audit events loaded',
  emptyBody: 'Audit activity will appear here after the audit log API is connected.'
}

export const notificationsPage: KbSectionConfig = {
  title: 'Notifications',
  description: 'Review workflow and operational notifications for KB users.',
  entityName: 'Notifications',
  primaryAction: 'Create announcement',
  emptyTitle: 'No notifications loaded',
  emptyBody: 'Notifications will appear here after the notifications API is connected.'
}

export const usersPage: KbSectionConfig = {
  title: 'Users',
  description: 'Manage SSO-backed users and global KB role assignments.',
  entityName: 'Users',
  primaryAction: 'Add user',
  emptyTitle: 'No users loaded',
  emptyBody: 'SSO-backed users will appear here after the users API is connected.'
}

export const rolesPage: KbSectionConfig = {
  title: 'Roles',
  description: 'Review global KB roles and the permissions assigned to each role.',
  entityName: 'Role permissions',
  primaryAction: 'Edit role',
  emptyTitle: 'No role data loaded',
  emptyBody: 'Role configuration will appear here after the roles API is connected.'
}

export const settingsPage: KbSectionConfig = {
  title: 'Settings',
  description: 'Configure KB-wide publishing, review, media, export, and search behavior.',
  entityName: 'Admin settings',
  primaryAction: 'Save settings',
  emptyTitle: 'No settings loaded',
  emptyBody: 'Settings values will appear here after the settings API is connected.'
}
