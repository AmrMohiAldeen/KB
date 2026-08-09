import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/http'
import type { ArticleDetailsResponse } from '@/types/apps/articleTypes'
import type {
  ArticlePermissionsResponse,
  ArticleVersionComparisonResponse,
  ArticleVersionSummaryResponse
} from '@/types/apps/articleLifecycleTypes'
import ArticleVersionHistoryPage, {
  type ArticleVersionHistoryApi
} from './ArticleVersionHistoryPage'
import ArticleVersionComparisonPage from './ArticleVersionComparisonPage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() })
}))

const article: ArticleDetailsResponse = {
  articleId: 'article-1',
  title: 'Versioned guide',
  slug: 'versioned-guide',
  status: 'Published',
  category: null,
  owner: { userId: 'author-1', fullName: 'Article Author' },
  currentDraft: {
    draftId: 'draft-1',
    contentHash: 'hash',
    contentSizeBytes: 42,
    rowVersion: 'current-row-version',
    status: 'Published',
    isLocked: false,
    lockedBy: null,
    lockedAt: null,
    createdBy: { userId: 'author-1', fullName: 'Article Author' },
    updatedBy: null,
    createdAt: '2026-07-28T08:00:00Z',
    updatedAt: '2026-07-28T08:00:00Z'
  },
  currentPublishedVersion: null,
  createdAt: '2026-07-28T08:00:00Z',
  updatedAt: '2026-07-28T08:00:00Z',
  submittedAt: null,
  approvedAt: null,
  publishedAt: '2026-07-28T08:00:00Z'
}

const permissions: ArticlePermissionsResponse = {
  canEdit: false,
  canSubmitForReview: false,
  canReview: false,
  canRequestChanges: false,
  canApprove: false,
  canPublish: false,
  canDelete: false,
  canViewVersionHistory: true,
  canRestoreVersion: true,
  canLock: false,
  canUnlock: false,
  canComment: false,
  canSuggest: false,
  canOverrideWorkflow: false,
  workflowOverrideTargets: []
}

const version = (
  versionNumber: number,
  overrides: Partial<ArticleVersionSummaryResponse> = {}
): ArticleVersionSummaryResponse => ({
  versionId: `version-${versionNumber}`,
  articleId: 'article-1',
  versionNumber,
  contentHash: `hash-${versionNumber}`,
  contentSizeBytes: 42,
  sourceDraftId: 'draft-1',
  sourceDraftNumber: 1,
  snapshotReason: versionNumber === 2 ? 'Published' : 'Approved',
  isPublished: versionNumber === 2,
  createdBy: { userId: 'author-1', fullName: 'Article Author' },
  createdAt: `2026-07-2${versionNumber}T08:00:00Z`,
  publishedBy: versionNumber === 2 ? { userId: 'publisher-1', fullName: 'Publisher' } : null,
  publishedAt: versionNumber === 2 ? '2026-07-22T08:00:00Z' : null,
  ...overrides
})

const createApi = (overrides: Partial<ArticleVersionHistoryApi> = {}): ArticleVersionHistoryApi => ({
  getArticle: vi.fn().mockResolvedValue(article),
  getPermissions: vi.fn().mockResolvedValue(permissions),
  getVersions: vi.fn().mockResolvedValue({
    items: [version(2), version(1)],
    page: 1,
    pageSize: 10,
    totalCount: 2
  }),
  restore: vi.fn().mockResolvedValue({
    articleId: 'article-1',
    draftId: 'restored-draft',
    status: 'Draft',
    rowVersion: 'restored-version',
    publishedVersionId: null,
    publishedVersionNumber: null,
    changedAt: '2026-07-28T09:00:00Z'
  }),
  ...overrides
})

describe('ArticleVersionHistoryPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const settle = async () => {
    await act(async () => {
      await Promise.resolve()
      await new Promise(resolve => window.setTimeout(resolve, 0))
    })
  }

  const renderHistory = async (
    api: ArticleVersionHistoryApi,
    onNavigate = vi.fn()
  ) => {
    await act(async () => {
      root.render(createElement(ArticleVersionHistoryPage, {
        lang: 'en',
        articleId: 'article-1',
        accessToken: 'token',
        api,
        onNavigate
      }))
    })
    await settle()
    return onNavigate
  }

  const click = async (element: Element | null) => {
    expect(element).not.toBeNull()
    await act(async () => {
      element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    await settle()
  }

  const buttonByText = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === label
    ) ?? null

  it('loads paginated history and renders metadata and publishing status', async () => {
    const api = createApi()
    await renderHistory(api)

    expect(api.getVersions).toHaveBeenCalledWith(
      'article-1',
      { page: 1, pageSize: 10 },
      'token',
      expect.any(AbortSignal)
    )
    expect(document.body.textContent).toContain('Version 2')
    expect(document.body.textContent).toContain('Approved')
    expect(document.body.textContent).toContain('Article Author')
    expect(document.body.textContent).toContain('Published snapshot')
    expect(document.querySelector('table[aria-label="Article versions"]')).not.toBeNull()
  })

  it('selects two versions and opens the comparison view', async () => {
    const navigate = await renderHistory(createApi())

    await click(document.querySelector('input[aria-label="Select row version-2"]'))
    await click(document.querySelector('input[aria-label="Select row version-1"]'))
    await click(buttonByText('Compare selected (2/2)'))

    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('/en/editor/versions/compare?'))
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('baseVersionId=version-1'))
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('targetVersionId=version-2'))
  })

  it('confirms restore, uses a fresh row version, and redirects to the restored draft', async () => {
    const api = createApi()
    const navigate = await renderHistory(api)

    await click(Array.from(document.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Restore'
    ) ?? null)
    expect(document.body.textContent).toContain('does not replace the published article')
    await click(buttonByText('Create restored draft'))

    expect(api.getArticle).toHaveBeenCalledTimes(2)
    expect(api.restore).toHaveBeenCalledWith(
      'article-1',
      'version-2',
      { rowVersion: 'current-row-version' },
      'token'
    )
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('restoredFromVersion=2'))
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('draftId=restored-draft'))
  })

  it('keeps the confirmation context and shows a restore failure', async () => {
    const api = createApi({
      restore: vi.fn().mockRejectedValue(new ApiError(409, {
        status: 409,
        title: 'Concurrency conflict',
        detail: 'The article changed after it was loaded.'
      }))
    })
    await renderHistory(api)

    await click(Array.from(document.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Restore'
    ) ?? null)
    await click(buttonByText('Create restored draft'))

    expect(document.body.textContent).toContain('The article changed after it was loaded.')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('shows a retryable history loading error', async () => {
    await renderHistory(createApi({
      getVersions: vi.fn().mockRejectedValue(new ApiError(503, {
        status: 503,
        title: 'Service unavailable',
        detail: 'Version storage unavailable.'
      }))
    }))

    expect(document.body.textContent).toContain('Version storage unavailable.')
    expect(buttonByText('Retry')).not.toBeNull()
  })
})

describe('ArticleVersionComparisonPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders readable added, removed, and changed comparison results', async () => {
    const result: ArticleVersionComparisonResponse = {
      baseVersion: version(1),
      targetVersion: version(2),
      addedCount: 1,
      removedCount: 1,
      changedCount: 1,
      unchangedCount: 2,
      changes: [
        {
          changeType: 'Changed',
          blockType: 'paragraph',
          blockLabel: 'Paragraph',
          beforePosition: 1,
          afterPosition: 1,
          beforeText: 'old wording',
          afterText: 'new wording',
          segments: [
            { changeType: 'Removed', text: 'old' },
            { changeType: 'Added', text: 'new' },
            { changeType: 'Unchanged', text: ' wording' }
          ]
        },
        {
          changeType: 'Added',
          blockType: 'paragraph',
          blockLabel: 'Paragraph',
          beforePosition: null,
          afterPosition: 2,
          beforeText: null,
          afterText: 'added guidance',
          segments: [{ changeType: 'Added', text: 'added guidance' }]
        }
      ]
    }
    const compare = vi.fn().mockResolvedValue(result)

    await act(async () => {
      root.render(createElement(ArticleVersionComparisonPage, {
        lang: 'en',
        articleId: 'article-1',
        baseVersionId: 'version-1',
        targetVersionId: 'version-2',
        accessToken: 'token',
        compare,
        onNavigate: vi.fn()
      }))
    })
    await act(async () => {
      await Promise.resolve()
      await new Promise(resolve => window.setTimeout(resolve, 0))
    })

    expect(compare).toHaveBeenCalled()
    expect(document.body.textContent).toContain('1 added')
    expect(document.body.textContent).toContain('1 removed')
    expect(document.body.textContent).toContain('1 changed')
    expect(document.body.textContent).toContain('old wording')
    expect(document.body.textContent).toContain('added guidance')
    expect(document.body.textContent).not.toContain('"type":"doc"')
  })
})
