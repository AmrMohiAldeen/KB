import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUserRoles, getUsers } from './usersApi'

describe('usersApi', () => {
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_KB_API_BASE_URL', 'https://api.example.test') })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('sends server-side query parameters and bearer authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      items: [], page: 2, pageSize: 25, totalCount: 0
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await getUsers({
      search: 'amy', role: 'Reviewer', status: 'active', page: 2, pageSize: 25,
      sortBy: 'lastLoginAt', sortDirection: 'desc'
    }, 'token')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.example.test/api/users?page=2&pageSize=25&sortBy=lastLoginAt&sortDirection=desc' +
      '&search=amy&role=Reviewer&status=active'
    )
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers)
    expect(((fetchMock.mock.calls[0][1] as RequestInit).headers as Headers).get('Authorization')).toBe('Bearer token')
  })

  it('loads role filter options from the roles table endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { roleId: 'role-1', roleName: 'Admin' }
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))

    expect(await getUserRoles('token')).toEqual([{ roleId: 'role-1', roleName: 'Admin' }])
  })
})
