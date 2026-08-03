import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeAuditLogApiError, getAuditLogs } from '@/lib/api/auditLogsApi'
import { ApiError } from '@/lib/api/http'
import { AccessTokenProvider } from '@/lib/auth/accessTokenContext'
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

  it('shows the sign-in-required state without calling the API when logged out', async () => {
    await renderPage('')

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).not.toContain('Audit logs could not be loaded')
    expect(getAuditLogs).not.toHaveBeenCalled()
  })

  it('treats a 401 as an authentication failure', async () => {
    vi.mocked(getAuditLogs).mockRejectedValue(new ApiError(401, {
      status: 401,
      title: 'Unauthorized'
    }))

    await renderPage('expired-token')

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).toContain(describeAuditLogApiError(
      new ApiError(401, { status: 401, title: 'Unauthorized' })
    )[0])
    expect(document.body.textContent).not.toContain('Audit logs could not be loaded')
  })

  it('uses the persistent dashboard-layout token during client navigation', async () => {
    vi.mocked(getAuditLogs).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      totalCount: 0
    })

    await act(async () => {
      root.render(createElement(
        AccessTokenProvider,
        {
          accessToken: 'layout-token',
          children: createElement(AuditActivityFeed)
        }
      ))
    })
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 0))
      await Promise.resolve()
    })

    expect(getAuditLogs).toHaveBeenCalledWith(expect.any(Object), 'layout-token', expect.any(AbortSignal))
    expect(document.body.textContent).not.toContain('Sign in required')
  })

  it('keeps authorization and server failures out of the sign-in state', async () => {
    vi.mocked(getAuditLogs).mockRejectedValue(new ApiError(403, {
      status: 403,
      title: 'Forbidden'
    }))

    await renderPage('valid-token')

    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).toContain('Audit logs could not be loaded')
    expect(document.body.textContent).toContain('You do not have permission to view audit logs.')
  })
})
