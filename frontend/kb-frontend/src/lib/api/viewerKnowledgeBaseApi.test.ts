import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getViewerCategoryImage,
  getViewerPortal,
  getViewerPreviewCategoryImage,
  getViewerPreviewPortal
} from './viewerKnowledgeBaseApi'

describe('viewer knowledge base authorization paths', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://kb-api.example.test')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('uses only the viewer cookie for external roots and the internal bearer JWT for preview roots', async () => {
    await getViewerPortal('swiftassess')
    await getViewerPreviewPortal('synopsis', 'internal.jwt')

    expect(fetchMock.mock.calls[0][0]).toBe('https://kb-api.example.test/api/viewer/swiftassess')
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
    expect(fetchMock.mock.calls[1][0]).toBe('https://kb-api.example.test/api/viewer/preview/synopsis')
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer internal.jwt')
  })

  it('loads category artwork through the same scoped authentication boundary', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    }))

    await getViewerCategoryImage('swiftassess', 'category-1')
    await getViewerPreviewCategoryImage('synopsis', 'category-2', 'internal.jwt')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://kb-api.example.test/api/viewer/swiftassess/categories/category-1/image'
    )
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('Authorization')).toBe(false)
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://kb-api.example.test/api/viewer/preview/synopsis/categories/category-2/image'
    )
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer internal.jwt')
  })
})
