import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { changeUserRole, createUser, getUserRoles, getUsers } from './usersApi'

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

  it('creates users and changes roles through protected user-management endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      userId: 'user-1', email: 'new@example.test', fullName: 'New User', isActive: true,
      createdAt: '2026-08-24T00:00:00Z', lastLoginAt: null, roles: []
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await createUser({ fullName: 'New User', email: 'new@example.test', roleId: 'role-1' }, 'token')
    await changeUserRole('user-1', 'role-2', 'token')

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/users')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(
      JSON.stringify({ fullName: 'New User', email: 'new@example.test', roleId: 'role-1' })
    )
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example.test/api/users/user-1/role')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT')
    expect((fetchMock.mock.calls[1][1] as RequestInit).body).toBe(JSON.stringify({ roleId: 'role-2' }))
  })
})
