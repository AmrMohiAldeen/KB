import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireArticleDraftLock,
  forceReleaseArticleDraftLock,
  getArticleDraft,
  releaseArticleDraftLock,
  saveArticleDraftContent
} from './articleDraftsApi'
import { ApiError } from './http'

describe('article draft API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ rowVersion: 'next' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses the exact draft routes and concurrency bodies', async () => {
    await getArticleDraft('article/id', 'Bearer token')
    await acquireArticleDraftLock('article/id', { rowVersion: 'lock-version' }, 'token')
    await releaseArticleDraftLock('article/id', { rowVersion: 'release-version' }, 'token', { keepalive: true })
    await forceReleaseArticleDraftLock('article/id', { rowVersion: 'force-version' }, 'token')
    await saveArticleDraftContent('article/id', {
      content: { type: 'doc', content: [] },
      renderedHtml: '<p></p>',
      plainText: '',
      rowVersion: 'save-version'
    }, 'token')

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/articles/article%2Fid/draft',
      'https://api.example.test/api/articles/article%2Fid/draft/lock',
      'https://api.example.test/api/articles/article%2Fid/draft/lock',
      'https://api.example.test/api/articles/article%2Fid/draft/lock/force-release',
      'https://api.example.test/api/articles/article%2Fid/draft/content'
    ])
    expect(calls.map(([, init]) => init?.method)).toEqual([undefined, 'POST', 'DELETE', 'POST', 'PUT'])
    expect(JSON.parse(String(calls[1][1]?.body))).toEqual({ rowVersion: 'lock-version' })
    expect(JSON.parse(String(calls[2][1]?.body))).toEqual({ rowVersion: 'release-version' })
    expect(calls[2][1]?.keepalive).toBe(true)
    expect(new Headers(calls[4][1]?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('rejects missing credentials before making a draft request', async () => {
    await expect(getArticleDraft('article-id', '   ')).rejects.toBeInstanceOf(ApiError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
