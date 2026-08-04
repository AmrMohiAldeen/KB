import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getServerAccessTokenMock } = vi.hoisted(() => ({
  getServerAccessTokenMock: vi.fn()
}))

vi.mock('@/lib/auth/serverAccessToken', () => ({
  getServerAccessToken: getServerAccessTokenMock
}))
vi.mock('@/views/kb/dashboard/KnowledgeDashboard', () => ({ default: () => null }))
vi.mock('@/views/kb/audit/AuditActivityFeed', () => ({ default: () => null }))
vi.mock('@/views/kb/media/MediaLibraryPage', () => ({ default: () => null }))

import AuditLogsPage from './audit-logs/page'
import DashboardPage from './dashboard/page'
import MediaPage from './media/page'

type TokenElement = { props: { accessToken: string; locale?: string } }

describe('dashboard-route authentication forwarding', () => {
  beforeEach(() => {
    getServerAccessTokenMock.mockReset()
    getServerAccessTokenMock.mockResolvedValue('session-token')
  })

  it('re-resolves and forwards the existing server session for each protected route navigation', async () => {
    const dashboard = await DashboardPage() as TokenElement
    const auditLogs = await AuditLogsPage() as TokenElement
    const media = await MediaPage({ params: Promise.resolve({ lang: 'en' }) }) as TokenElement

    expect(getServerAccessTokenMock).toHaveBeenCalledTimes(3)
    expect(dashboard.props.accessToken).toBe('session-token')
    expect(auditLogs.props.accessToken).toBe('session-token')
    expect(media.props).toMatchObject({ accessToken: 'session-token', locale: 'en' })
  })
})
