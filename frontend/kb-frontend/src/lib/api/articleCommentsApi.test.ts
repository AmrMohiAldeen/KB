import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createArticleComment,
  deleteArticleComment,
  getArticleComments,
  replyToArticleComment,
  setArticleCommentResolved,
  updateArticleComment
} from './articleCommentsApi'

describe('article comments API', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test/')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ commentId: 'comment-1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('uses article-scoped thread routes and concurrency bodies', async () => {
    await getArticleComments('article/id', 'token')
    await createArticleComment('article/id', {
      body: 'Inline',
      currentDraftId: 'draft-1',
      anchorType: 'TextRange',
      anchorData: { from: 1, to: 7, selectedText: 'target' }
    }, 'token')
    await replyToArticleComment('article/id', 'thread/id', 'Reply', 'token')
    await updateArticleComment('article/id', 'comment/id', {
      body: 'Updated',
      rowVersion: 'v1'
    }, 'token')
    await deleteArticleComment('article/id', 'comment/id', 'v2', 'token')
    await setArticleCommentResolved('article/id', 'thread/id', 'v3', true, 'token')
    await setArticleCommentResolved('article/id', 'thread/id', 'v4', false, 'token')

    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map(([url]) => url)).toEqual([
      'https://api.example.test/api/articles/article%2Fid/comments',
      'https://api.example.test/api/articles/article%2Fid/comments',
      'https://api.example.test/api/articles/article%2Fid/comments/thread%2Fid/replies',
      'https://api.example.test/api/articles/article%2Fid/comments/comment%2Fid',
      'https://api.example.test/api/articles/article%2Fid/comments/comment%2Fid',
      'https://api.example.test/api/articles/article%2Fid/comments/thread%2Fid/resolve',
      'https://api.example.test/api/articles/article%2Fid/comments/thread%2Fid/reopen'
    ])
    expect(calls.map(([, init]) => init?.method)).toEqual([
      undefined, 'POST', 'POST', 'PUT', 'DELETE', 'POST', 'POST'
    ])
    expect(JSON.parse(String(calls[4][1]?.body))).toEqual({ rowVersion: 'v2' })
    expect(JSON.parse(String(calls[5][1]?.body))).toEqual({ rowVersion: 'v3' })
  })
})
