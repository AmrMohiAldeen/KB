import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './http'
import {
  describeMediaApiError,
  getMedia,
  isReferencedMediaDeleteConflict
} from './mediaApi'

describe('mediaApi', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_KB_API_BASE_URL = 'https://kb-api.example.test'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_KB_API_BASE_URL
  })

  it('serializes pagination, filename search, media-type, and status filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [],
      page: 3,
      pageSize: 25,
      totalCount: 0
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))

    vi.stubGlobal('fetch', fetchMock)

    await getMedia({
      search: '  manual  ',
      mediaType: 'pdf',
      status: 'Archived',
      page: 3,
      pageSize: 25
    }, 'token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://kb-api.example.test/api/media?page=3&pageSize=25&search=manual&mediaType=pdf&status=Archived',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers)
      })
    )
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('recognizes and explains the backend reference restriction', () => {
    const error = new ApiError(409, {
      status: 409,
      title: 'Conflict',
      detail: 'Referenced media cannot be permanently deleted.'
    })

    expect(isReferencedMediaDeleteConflict(error)).toBe(true)
    expect(describeMediaApiError(error)).toEqual([
      'This file is still referenced by knowledge base content. Remove all references before deleting it permanently.'
    ])
  })
})
