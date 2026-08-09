import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  compareArticleVersions,
  describeLifecycleError,
  getArticleVersions,
  isLifecycleConflict,
  restoreArticleVersion,
  transitionArticle,
  unarchiveArticle
} from './articleLifecycleApi'

describe('article lifecycle API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('submits a successful transition with the current row version', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      articleId: 'article-id',
      draftId: 'draft-id',
      status: 'SubmittedForReview',
      rowVersion: 'fresh-version',
      publishedVersionId: null,
      publishedVersionNumber: null,
      changedAt: '2026-07-28T09:00:00Z'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await transitionArticle(
      'article-id',
      'submitForReview',
      { rowVersion: 'current-version', comment: null, additionalRecipientIds: ['user-2'] },
      'access-token'
    )
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe('https://api.example.test/api/articles/article-id/submit-for-review')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      rowVersion: 'current-version',
      comment: null,
      additionalRecipientIds: ['user-2']
    })
    expect(result.status).toBe('SubmittedForReview')
    expect(result.rowVersion).toBe('fresh-version')
  })

  it('surfaces backend validation errors for a missing review reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 400,
      title: 'Validation failed',
      errors: { Comment: ['A reason is required when requesting changes.'] }
    }), { status: 400, headers: { 'content-type': 'application/problem+json' } }))

    await expect(transitionArticle(
      'article-id',
      'requestChanges',
      { rowVersion: 'version', comment: '' },
      'access-token'
    )).rejects.toSatisfy((error: unknown) =>
      error instanceof ApiError &&
      describeLifecycleError(error)[0] === 'A reason is required when requesting changes.'
    )
  })

  it('describes permission failures clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 403,
      title: 'Forbidden'
    }), { status: 403, headers: { 'content-type': 'application/problem+json' } }))

    let caught: unknown
    try {
      await transitionArticle('article-id', 'approve', { rowVersion: 'version' }, 'access-token')
    } catch (error) {
      caught = error
    }

    expect(describeLifecycleError(caught)).toEqual([
      'You no longer have permission to perform this lifecycle action.'
    ])
  })

  it('includes the backend trace reference for unexpected lifecycle failures', () => {
    const error = new ApiError(500, {
      status: 500,
      detail: 'An unexpected error occurred. Contact support with the trace ID.',
      traceId: 'trace-500'
    })

    expect(describeLifecycleError(error)).toEqual([
      'An unexpected error occurred. Contact support with the trace ID. (Reference: trace-500)'
    ])
  })

  it('identifies concurrency conflicts so the UI can offer reload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 409,
      title: 'Concurrency conflict',
      detail: 'The article changed after it was loaded.'
    }), { status: 409, headers: { 'content-type': 'application/problem+json' } }))

    let caught: unknown
    try {
      await transitionArticle('article-id', 'publish', { rowVersion: 'stale' }, 'access-token')
    } catch (error) {
      caught = error
    }

    expect(isLifecycleConflict(caught)).toBe(true)
    expect(describeLifecycleError(caught)).toEqual(['The article changed after it was loaded.'])
  })

  it('restores the selected version with optimistic concurrency', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      articleId: 'article-id',
      draftId: 'new-draft-id',
      status: 'Draft',
      rowVersion: 'new-version',
      publishedVersionId: null,
      publishedVersionNumber: null,
      changedAt: '2026-07-28T09:30:00Z'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await restoreArticleVersion(
      'article-id',
      'version-id',
      { rowVersion: 'published-row-version' },
      'access-token'
    )
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe('https://api.example.test/api/articles/article-id/versions/version-id/restore')
    expect(JSON.parse(String(init?.body))).toEqual({ rowVersion: 'published-row-version' })
    expect(result).toMatchObject({ status: 'Draft', draftId: 'new-draft-id' })
  })

  it('unarchives an article through the lifecycle endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      articleId: 'article-id',
      draftId: 'draft-id',
      status: 'Published',
      rowVersion: 'restored-version',
      publishedVersionId: null,
      publishedVersionNumber: null,
      changedAt: '2026-08-08T09:30:00Z'
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await unarchiveArticle('article-id', 'access-token')
    const [url, init] = fetchMock.mock.calls[0]

    expect(url).toBe('https://api.example.test/api/articles/article-id/unarchive')
    expect(init?.method).toBe('POST')
    expect(result.status).toBe('Published')
  })

  it('loads a paginated version history', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [],
      page: 2,
      pageSize: 25,
      totalCount: 31
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await getArticleVersions(
      'article-id',
      { page: 2, pageSize: 25 },
      'access-token'
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/articles/article-id/versions?page=2&pageSize=25'
    )
    expect(result.totalCount).toBe(31)
  })

  it('requests a readable comparison for the selected pair', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      baseVersion: { versionId: 'base' },
      targetVersion: { versionId: 'target' },
      changes: [],
      addedCount: 0,
      removedCount: 0,
      changedCount: 0,
      unchangedCount: 2
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await compareArticleVersions(
      'article-id',
      'base version',
      'target/version',
      'access-token'
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/articles/article-id/versions/compare?' +
      'baseVersionId=base+version&targetVersionId=target%2Fversion'
    )
    expect(result.unchangedCount).toBe(2)
  })
})
