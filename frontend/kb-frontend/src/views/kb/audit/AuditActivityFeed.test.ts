import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuditLogs } from '@/lib/api/auditLogsApi'
import { ApiError } from '@/lib/api/http'
import AuditActivityFeed from './AuditActivityFeed'

vi.mock('@/lib/api/auditLogsApi', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/auditLogsApi')>()

  return {
    ...actual,
    getAuditLogs: vi.fn()
  }
})

describe('AuditActivityFeed authentication states', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(getAuditLogs).mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderPage = async (accessToken: string) => {
    await act(async () => {
      root.render(createElement(AuditActivityFeed, { accessToken }))
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 0))
      await Promise.resolve()
    })
  }

  it('loads audit logs with the server-forwarded dashboard session token', async () => {
    vi.mocked(getAuditLogs).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      totalCount: 0
    })

    await renderPage('session-token')

    expect(getAuditLogs).toHaveBeenCalledWith(expect.any(Object), 'session-token', expect.any(AbortSignal))
    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).not.toContain('Audit logs could not be loaded')
  })

  it('shows the sign-in-required state without calling the API when logged out', async () => {
    await renderPage('')

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).not.toContain('Audit logs could not be loaded')
    expect(getAuditLogs).not.toHaveBeenCalled()
  })

  it('treats a backend 401 as an authentication failure', async () => {
    vi.mocked(getAuditLogs).mockRejectedValue(new ApiError(401, {
      status: 401,
      title: 'Unauthorized'
    }))

    await renderPage('expired-token')

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).not.toContain('Audit logs could not be loaded')
  })

  it('keeps a 403 as an authorization failure', async () => {
    vi.mocked(getAuditLogs).mockRejectedValue(new ApiError(403, {
      status: 403,
      title: 'Forbidden'
    }))

    await renderPage('session-token')

    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).toContain('Audit logs could not be loaded')
    expect(document.body.textContent).toContain('You do not have permission to view audit logs.')
  })

  it.each([
    [new ApiError(503, { status: 503, title: 'Service unavailable' }), 'Service unavailable'],
    [new ApiError(0, { status: 0, title: 'Network error' }), 'could not be reached']
  ])('keeps server and network failures distinct from authentication', async (error, message) => {
    vi.mocked(getAuditLogs).mockRejectedValue(error)

    await renderPage('session-token')

    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).toContain('Audit logs could not be loaded')
    expect(document.body.textContent).toContain(message)
  })
})
