import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getViewerPortal, getViewerPreviewPortal } from './viewerKnowledgeBaseApi'

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
})
