import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportJobResponse } from '@/types/apps/exportJobTypes'
import { requestArticleExport, waitForExport } from './exportJobsApi'

const job = (status: ExportJobResponse['status'], errorMessage: string | null = null): ExportJobResponse => ({
  exportJobId: 'job-1',
  entityType: 'Article',
  articleId: 'article-1',
  categoryId: null,
  sourceType: 'Draft',
  draftId: 'draft-1',
  versionId: null,
  exportType: 'HTML',
  status,
  requestedBy: { userId: 'user-1', fullName: 'User One' },
  requestedAt: '2026-08-13T08:00:00Z',
  startedAt: null,
  completedAt: null,
  fileName: 'article.html',
  downloadUrl: null,
  errorMessage
})

describe('export jobs API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sends an explicit draft source instead of relying on the published version', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(job('Pending')), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    }))

    await requestArticleExport('article/one', { sourceType: 'Draft', draftId: 'draft-7' }, 'PDF', 'token')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/export-jobs/articles/article%2Fone')
    expect(JSON.parse(String(init?.body))).toEqual({
      exportType: 'PDF',
      sourceType: 'Draft',
      draftId: 'draft-7'
    })
  })

  it('sends an explicit historical version source', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(job('Pending')), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    }))

    await requestArticleExport('article-1', { sourceType: 'Version', versionId: 'version-9' }, 'HTML', 'token')

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      exportType: 'HTML',
      sourceType: 'Version',
      versionId: 'version-9'
    })
  })

  it('stops immediately and surfaces the persisted worker failure', async () => {
    await expect(waitForExport(job('Failed', 'Object storage is unavailable.'), 'token'))
      .rejects.toThrow('Object storage is unavailable.')
  })

  it('stops polling when the bounded wait expires', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(job('Pending')), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    const result = waitForExport(job('Pending'), 'token', { timeoutMs: 20, pollIntervalMs: 10 })
    await expect(result).rejects.toThrow('polling was stopped')
  })
})
