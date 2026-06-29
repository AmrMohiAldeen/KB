import type { Content } from '@tiptap/core'
import type { KbUserRole, UsersType } from '@/types/apps/userTypes'

export type ArticleStatus = 'Published' | 'Draft' | 'To Review' | 'Archived'
export type ArticleFilter = 'Everything' | ArticleStatus | 'Followed'
export type KbRowKind = 'category' | 'article'

export type KbCategoryNode = {
  id: string
  name: string
  subtitle: string
  slug: string
  parentId: string | null
  articleCount: number
  updatedAt: string
  children?: KbCategoryNode[]
}

export type KbArticle = {
  id: string
  title: string
  slug: string
  categoryId: string
  categoryPath: string
  status: ArticleStatus
  owner: string
  updatedAt: string
  views: number
  version: string
  followed: boolean
}

export type KbListRow =
  | {
      kind: 'category'
      id: string
      name: string
      articleCount: number
      statusCounts: Record<ArticleStatus, number>
      updatedAt: string
    }
  | {
      kind: 'article'
      article: KbArticle
    }

export type ReviewColumnId = 'requests' | 'drafts' | 'review' | 'published'

export type ReviewCard = {
  id: string
  title: string
  owner: string
  status: ArticleStatus | 'Request'
  updatedAt: string
  columnId: ReviewColumnId
}

export type AuditEvent = {
  id: string
  actor: string
  action: string
  article: string
  detail: string
  createdAt: string
}

export type MediaFile = {
  id: string
  fileName: string
  mimeType: string
  size: string
  uploadedBy: string
  uploadedAt: string
  references: number
  previewTone: 'blue' | 'green' | 'amber' | 'violet' | 'slate'
}

export type RoleDefinition = {
  role: KbUserRole
  label: string
  summary: string
  users: number
  permissions: string[]
}

export const articleFilters: Array<{ label: ArticleFilter; count: number }> = [
  { label: 'Everything', count: 42 },
  { label: 'Published', count: 24 },
  { label: 'Draft', count: 11 },
  { label: 'To Review', count: 5 },
  { label: 'Followed', count: 8 },
  { label: 'Archived', count: 2 }
]

export const kbCategories: KbCategoryNode[] = [
  {
    id: 'cat-getting-started',
    name: 'Getting Started',
    subtitle: 'Launch basics and account setup',
    slug: 'getting-started',
    parentId: null,
    articleCount: 8,
    updatedAt: '2026-06-24',
    children: [
      {
        id: 'cat-onboarding',
        name: 'Onboarding',
        subtitle: 'First workspace steps',
        slug: 'onboarding',
        parentId: 'cat-getting-started',
        articleCount: 3,
        updatedAt: '2026-06-20'
      }
    ]
  },
  {
    id: 'cat-integrations',
    name: 'Integrations',
    subtitle: 'SSO, webhooks, and third-party tools',
    slug: 'integrations',
    parentId: null,
    articleCount: 11,
    updatedAt: '2026-06-23',
    children: [
      {
        id: 'cat-sso',
        name: 'SSO',
        subtitle: 'Identity provider configuration',
        slug: 'sso',
        parentId: 'cat-integrations',
        articleCount: 4,
        updatedAt: '2026-06-22'
      },
      {
        id: 'cat-webhooks',
        name: 'Webhooks',
        subtitle: 'Event delivery and API callbacks',
        slug: 'webhooks',
        parentId: 'cat-integrations',
        articleCount: 3,
        updatedAt: '2026-06-18'
      }
    ]
  },
  {
    id: 'cat-compliance',
    name: 'Compliance',
    subtitle: 'Privacy, audit trails, and exports',
    slug: 'compliance',
    parentId: null,
    articleCount: 7,
    updatedAt: '2026-06-21'
  },
  {
    id: 'cat-editor',
    name: 'Article Editor',
    subtitle: 'Authoring workflows and reusable content',
    slug: 'article-editor',
    parentId: null,
    articleCount: 9,
    updatedAt: '2026-06-19'
  }
]

export const kbArticles: KbArticle[] = [
  {
    id: 'art-sso-session',
    title: 'Reset an SSO session',
    slug: 'reset-sso-session',
    categoryId: 'cat-sso',
    categoryPath: 'Integrations / SSO',
    status: 'To Review',
    owner: 'Nadia Karim',
    updatedAt: '2026-06-25',
    views: 184,
    version: 'Draft v3',
    followed: true
  },
  {
    id: 'art-approved-publish',
    title: 'Publish an approved article',
    slug: 'publish-approved-article',
    categoryId: 'cat-editor',
    categoryPath: 'Article Editor',
    status: 'Published',
    owner: 'Omar Saleh',
    updatedAt: '2026-06-24',
    views: 942,
    version: 'v12',
    followed: true
  },
  {
    id: 'art-webhook-signatures',
    title: 'Verify webhook signatures',
    slug: 'verify-webhook-signatures',
    categoryId: 'cat-webhooks',
    categoryPath: 'Integrations / Webhooks',
    status: 'Draft',
    owner: 'Layla Hassan',
    updatedAt: '2026-06-22',
    views: 73,
    version: 'Draft v1',
    followed: false
  },
  {
    id: 'art-export-archive',
    title: 'Export a compliance archive',
    slug: 'export-compliance-archive',
    categoryId: 'cat-compliance',
    categoryPath: 'Compliance',
    status: 'Published',
    owner: 'Mina Davis',
    updatedAt: '2026-06-19',
    views: 356,
    version: 'v5',
    followed: false
  },
  {
    id: 'art-first-kb',
    title: 'Create your first knowledge base article',
    slug: 'create-first-article',
    categoryId: 'cat-onboarding',
    categoryPath: 'Getting Started / Onboarding',
    status: 'Published',
    owner: 'Nadia Karim',
    updatedAt: '2026-06-18',
    views: 1204,
    version: 'v8',
    followed: true
  },
  {
    id: 'art-retired-saml',
    title: 'Legacy SAML certificate rotation',
    slug: 'legacy-saml-certificate-rotation',
    categoryId: 'cat-sso',
    categoryPath: 'Integrations / SSO',
    status: 'Archived',
    owner: 'Omar Saleh',
    updatedAt: '2026-06-03',
    views: 49,
    version: 'v2',
    followed: false
  }
]

export const kbRows: KbListRow[] = [
  {
    kind: 'category',
    id: 'cat-getting-started',
    name: 'Getting Started',
    articleCount: 8,
    statusCounts: { Published: 6, Draft: 1, 'To Review': 1, Archived: 0 },
    updatedAt: '2026-06-24'
  },
  { kind: 'article', article: kbArticles[4] },
  {
    kind: 'category',
    id: 'cat-integrations',
    name: 'Integrations',
    articleCount: 11,
    statusCounts: { Published: 6, Draft: 2, 'To Review': 2, Archived: 1 },
    updatedAt: '2026-06-23'
  },
  { kind: 'article', article: kbArticles[0] },
  { kind: 'article', article: kbArticles[2] },
  {
    kind: 'category',
    id: 'cat-compliance',
    name: 'Compliance',
    articleCount: 7,
    statusCounts: { Published: 5, Draft: 1, 'To Review': 1, Archived: 0 },
    updatedAt: '2026-06-21'
  },
  { kind: 'article', article: kbArticles[3] },
  {
    kind: 'category',
    id: 'cat-editor',
    name: 'Article Editor',
    articleCount: 9,
    statusCounts: { Published: 7, Draft: 1, 'To Review': 1, Archived: 0 },
    updatedAt: '2026-06-19'
  },
  { kind: 'article', article: kbArticles[1] },
  { kind: 'article', article: kbArticles[5] }
]

export const reviewCards: ReviewCard[] = [
  {
    id: 'req-1',
    title: 'Document SCIM role syncing',
    owner: 'Rana Ahmed',
    status: 'Request',
    updatedAt: '2 minutes ago',
    columnId: 'requests'
  },
  {
    id: 'draft-1',
    title: 'Verify webhook signatures',
    owner: 'Layla Hassan',
    status: 'Draft',
    updatedAt: '2026-06-22',
    columnId: 'drafts'
  },
  {
    id: 'draft-2',
    title: 'Media retention policy',
    owner: 'Mina Davis',
    status: 'Draft',
    updatedAt: '2026-06-20',
    columnId: 'drafts'
  },
  {
    id: 'review-1',
    title: 'Reset an SSO session',
    owner: 'Nadia Karim',
    status: 'To Review',
    updatedAt: '2026-06-25',
    columnId: 'review'
  },
  {
    id: 'published-1',
    title: 'Publish an approved article',
    owner: 'Omar Saleh',
    status: 'Published',
    updatedAt: '2026-06-24',
    columnId: 'published'
  },
  {
    id: 'published-2',
    title: 'Create your first knowledge base article',
    owner: 'Nadia Karim',
    status: 'Published',
    updatedAt: '2026-06-18',
    columnId: 'published'
  }
]

export const auditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    actor: 'Omar Saleh',
    action: 'Published',
    article: 'Publish an approved article',
    detail: 'Promoted draft v12 to the public article version.',
    createdAt: '2 minutes ago'
  },
  {
    id: 'audit-2',
    actor: 'Nadia Karim',
    action: 'Submitted',
    article: 'Reset an SSO session',
    detail: 'Sent draft v3 to review.',
    createdAt: '18 minutes ago'
  },
  {
    id: 'audit-3',
    actor: 'Mina Davis',
    action: 'Exported',
    article: 'Export a compliance archive',
    detail: 'Queued PDF and ZIP export package.',
    createdAt: '1 hour ago'
  },
  {
    id: 'audit-4',
    actor: 'System',
    action: 'Indexed',
    article: 'Create your first knowledge base article',
    detail: 'Updated search index document after publish.',
    createdAt: '3 hours ago'
  }
]

export const mediaFiles: MediaFile[] = [
  {
    id: 'media-1',
    fileName: 'sso-error-flow.png',
    mimeType: 'image/png',
    size: '184 KB',
    uploadedBy: 'Nadia Karim',
    uploadedAt: '2026-06-24 09:30',
    references: 3,
    previewTone: 'blue'
  },
  {
    id: 'media-2',
    fileName: 'webhook-payload.json',
    mimeType: 'application/json',
    size: '12 KB',
    uploadedBy: 'Layla Hassan',
    uploadedAt: '2026-06-22 13:10',
    references: 1,
    previewTone: 'green'
  },
  {
    id: 'media-3',
    fileName: 'compliance-export-screen.png',
    mimeType: 'image/png',
    size: '246 KB',
    uploadedBy: 'Mina Davis',
    uploadedAt: '2026-06-20 16:48',
    references: 2,
    previewTone: 'amber'
  },
  {
    id: 'media-4',
    fileName: 'editor-toolbar-reference.png',
    mimeType: 'image/png',
    size: '312 KB',
    uploadedBy: 'Omar Saleh',
    uploadedAt: '2026-06-19 10:05',
    references: 5,
    previewTone: 'violet'
  },
  {
    id: 'media-5',
    fileName: 'release-checklist.pdf',
    mimeType: 'application/pdf',
    size: '98 KB',
    uploadedBy: 'Rana Ahmed',
    uploadedAt: '2026-06-18 08:12',
    references: 0,
    previewTone: 'slate'
  }
]

export const sampleUsers: UsersType[] = [
  {
    id: 'user-1',
    ssoId: 'okta-1001',
    email: 'admin@example.com',
    fullName: 'Nadia Karim',
    role: 'admin',
    status: 'active',
    createdAt: '2026-06-01',
    lastLoginAt: '2026-06-25T09:30:00Z'
  },
  {
    id: 'user-2',
    ssoId: 'okta-1002',
    email: 'omar@example.com',
    fullName: 'Omar Saleh',
    role: 'reviewer',
    status: 'active',
    createdAt: '2026-06-03',
    lastLoginAt: '2026-06-24T13:10:00Z'
  },
  {
    id: 'user-3',
    ssoId: 'okta-1003',
    email: 'layla@example.com',
    fullName: 'Layla Hassan',
    role: 'author',
    status: 'active',
    createdAt: '2026-06-08',
    lastLoginAt: '2026-06-22T08:20:00Z'
  },
  {
    id: 'user-4',
    ssoId: 'okta-1004',
    email: 'mina@example.com',
    fullName: 'Mina Davis',
    role: 'contributor',
    status: 'active',
    createdAt: '2026-06-10',
    lastLoginAt: null
  },
  {
    id: 'user-5',
    ssoId: 'okta-1005',
    email: 'rana@example.com',
    fullName: 'Rana Ahmed',
    role: 'viewer',
    status: 'inactive',
    createdAt: '2026-06-12',
    lastLoginAt: null
  }
]

export const roleDefinitions: RoleDefinition[] = [
  {
    role: 'admin',
    label: 'Admin',
    summary: 'Full KB administration and publishing control.',
    users: 1,
    permissions: ['Manage settings', 'Manage users', 'Publish articles', 'Delete drafts', 'Export data']
  },
  {
    role: 'author',
    label: 'Author',
    summary: 'Create and maintain article drafts.',
    users: 1,
    permissions: ['Create articles', 'Edit own drafts', 'Submit for review', 'Use media library']
  },
  {
    role: 'reviewer',
    label: 'Reviewer',
    summary: 'Review submissions and publish approved content.',
    users: 1,
    permissions: ['Review articles', 'Request changes', 'Publish articles', 'Comment on drafts']
  },
  {
    role: 'contributor',
    label: 'Contributor',
    summary: 'Suggest and draft content with limited workflow access.',
    users: 1,
    permissions: ['Create requests', 'Edit own drafts', 'Upload media']
  },
  {
    role: 'viewer',
    label: 'Viewer',
    summary: 'Read published and internal KB content.',
    users: 1,
    permissions: ['View articles', 'Follow articles']
  }
]

export const sampleArticleContent: Content = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Before you start' }]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Confirm the user is assigned to the correct identity provider group and has an active KB role.'
        }
      ]
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Open the SSO provider admin console.' }]
            }
          ]
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Clear the existing session and ask the user to sign in again.' }]
            }
          ]
        }
      ]
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'If the session still fails, capture the request id and submit the draft to the reviewer queue.'
        }
      ]
    }
  ]
}

export const currentEditorRole: KbUserRole = 'reviewer'

