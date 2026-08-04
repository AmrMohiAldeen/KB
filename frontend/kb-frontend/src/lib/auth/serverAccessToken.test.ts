import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
  headers: headersMock
}))

import { getServerAccessToken } from './serverAccessToken'

describe('getServerAccessToken', () => {
  beforeEach(() => {
    cookiesMock.mockReset()
    headersMock.mockReset()
  })

  it('uses the dashboard session cookie when a client-navigation request has no Authorization header', async () => {
    headersMock.mockResolvedValue(new Headers())
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => name === 'kb_access_token' ? { value: 'cookie-token' } : undefined)
    })

    await expect(getServerAccessToken()).resolves.toBe('cookie-token')
  })

  it('prefers and normalizes an explicitly forwarded Bearer token', async () => {
    headersMock.mockResolvedValue(new Headers({ Authorization: 'Bearer header-token' }))
    cookiesMock.mockResolvedValue({ get: vi.fn() })

    await expect(getServerAccessToken()).resolves.toBe('header-token')
    expect(cookiesMock).not.toHaveBeenCalled()
  })

  it('returns an empty token only when neither request authentication source exists', async () => {
    headersMock.mockResolvedValue(new Headers())
    cookiesMock.mockResolvedValue({ get: vi.fn() })

    await expect(getServerAccessToken()).resolves.toBe('')
  })
})
