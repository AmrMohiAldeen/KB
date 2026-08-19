import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'

const request = (fields: Record<string, string>) => new NextRequest('http://localhost/api/internal-preview', {
  method: 'POST',
  body: new URLSearchParams(fields)
})

describe('internal preview activation', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://kb-api.example.test')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('validates the internal JWT before establishing a refreshable preview session', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))

    const response = await POST(request({ categorySlug: 'swiftassess', accessToken: 'internal.jwt' }))

    expect(fetchMock).toHaveBeenCalledWith(
      'https://kb-api.example.test/api/viewer/preview/swiftassess',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: 'Bearer internal.jwt' }
      })
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost/swiftassess')
    expect(response.headers.get('set-cookie')).toContain('kb_internal_preview=internal.jwt')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax')
  })

  it('does not activate internal preview for an unauthenticated request', async () => {
    const response = await POST(request({ categorySlug: 'swiftassess' }))

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not activate internal preview when the backend rejects the supplied identity', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }))

    const response = await POST(request({ categorySlug: 'swiftassess', accessToken: 'viewer-or-forged.jwt' }))

    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
