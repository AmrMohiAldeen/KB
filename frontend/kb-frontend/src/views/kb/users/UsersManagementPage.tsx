'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { KbUserStatus, UserRoleSummary, UsersType } from '@/types/apps/userTypes'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import { KbPageShell } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import KbTableFilter from '@/views/shared/tables/KbTableFilter'
import { describeUsersApiError, getUserRoles, getUsers } from '@/lib/api/usersApi'
import { hasAccessToken, isAuthenticationError } from '@/lib/api/http'
import { useAccessToken } from '@/lib/auth/accessTokenContext'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'
import { formatDate } from '../shared/utils/formatDate'

type UsersManagementPageProps = { accessToken?: string }
const missingTokenMessage = 'Sign in through the company authentication provider before loading users.'

const UsersManagementPage = ({ accessToken: accessTokenOverride }: UsersManagementPageProps) => {
  const contextAccessToken = useAccessToken()
  const accessToken = accessTokenOverride ?? contextAccessToken
  const authenticated = hasAccessToken(accessToken)
  const [users, setUsers] = useState<UsersType[]>([])
  const [roles, setRoles] = useState<UserRoleSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<KbUserStatus | ''>('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'fullName', direction: 'asc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [loading, setLoading] = useState(authenticated)
  const [errors, setErrors] = useState<string[]>([])
  const [roleErrors, setRoleErrors] = useState<string[]>([])
  const [unauthorized, setUnauthorized] = useState(!authenticated)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    if (!authenticated) {
      return () => controller.abort()
    }
    void getUserRoles(accessToken, controller.signal).then(setRoles).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setRoleErrors(describeUsersApiError(error))
    })
    return () => controller.abort()
  }, [accessToken, authenticated])

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    if (!authenticated) {
      setUsers([]); setTotalCount(0); setLoading(false); setUnauthorized(true); setErrors([])
      return
    }
    setLoading(true); setUnauthorized(false); setErrors([])
    try {
      const response = await getUsers({
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page: page + 1,
        pageSize,
        sortBy: sort.columnId,
        sortDirection: sort.direction
      }, accessToken, signal)
      setUsers(response.items)
      setTotalCount(response.totalCount)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setUsers([]); setTotalCount(0)
      if (isAuthenticationError(error)) { setUnauthorized(true); setErrors([]) }
      else setErrors(describeUsersApiError(error))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, authenticated, debouncedSearch, page, pageSize, roleFilter, sort, statusFilter])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadUsers(controller.signal), 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [loadUsers])

  const columns = useMemo<Array<KbDataTableColumn<UsersType>>>(() => [
    { id: 'fullName', label: 'Name', sortable: true, render: user => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minInlineSize: 260 }}>
        <Avatar sx={{ inlineSize: 34, blockSize: 34 }}>{user.fullName.slice(0, 1)}</Avatar>
        <Box sx={{ minInlineSize: 0 }}>
          <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>{user.fullName}</Typography>
          <Typography variant='body2' color='text.secondary' noWrap>{user.email}</Typography>
        </Box>
      </Box>
    ) },
    { id: 'role', label: 'Roles', sortable: true, render: user => user.roles.length ? (
      <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap', minInlineSize: 150 }}>
        {user.roles.map(role => <Chip key={role.roleId} size='small' variant='tonal' label={role.roleName} />)}
      </Stack>
    ) : <Typography variant='body2' color='text.secondary'>No role</Typography> },
    { id: 'status', label: 'Status', sortable: true, render: user => (
      <StatusChip label={user.isActive ? 'active' : 'inactive'} color={user.isActive ? 'success' : 'secondary'} />
    ) },
    { id: 'createdAt', label: 'Joined', sortable: true, render: user => formatDate(user.createdAt) },
    { id: 'lastLoginAt', label: 'Last Login', sortable: true, render: user => user.lastLoginAt ? formatDate(user.lastLoginAt) : '—' }
  ], [])

  const resetPage = () => setPage(0)
  const allErrors = [...roleErrors, ...errors]

  return (
    <KbPageShell>
      <PageHeader title='Users' subtitle='View SSO users and their global KB roles.' />
      {unauthorized && <Alert severity='warning'><AlertTitle>Sign in required</AlertTitle>{missingTokenMessage}</Alert>}
      {!unauthorized && <KbValidationSummary title='Users could not be loaded' errors={allErrors} />}
      <KbDataTable
        ariaLabel='Users table' loading={loading} rows={users} columns={columns}
        getRowId={user => user.userId} enableSelection selectedRowIds={selectedRows}
        onSelectedRowIdsChange={setSelectedRows} sort={sort}
        onSortChange={nextSort => { setSort(nextSort); resetPage() }}
        toolbar={<KbTableToolbar
          searchValue={search} onSearchChange={value => { setSearch(value); resetPage() }}
          searchPlaceholder='Search name, email, or role' selectedCount={selectedRows.length}
          filters={<>
            <KbTableFilter select value={roleFilter}
              onChange={event => { setRoleFilter(event.target.value); resetPage() }}
              slotProps={{ htmlInput: { 'aria-label': 'Filter by role' } }}
              sx={{ inlineSize: { xs: '100%', sm: 180 } }}>
              <MenuItem value=''>All roles</MenuItem>
              {roles.map(role => <MenuItem key={role.roleId} value={role.roleName}>{role.roleName}</MenuItem>)}
            </KbTableFilter>
            <KbTableFilter select value={statusFilter}
              onChange={event => { setStatusFilter(event.target.value as KbUserStatus | ''); resetPage() }}
              slotProps={{ htmlInput: { 'aria-label': 'Filter by status' } }}
              sx={{ inlineSize: { xs: '100%', sm: 150 } }}>
              <MenuItem value=''>All statuses</MenuItem>
              <MenuItem value='active'>Active</MenuItem>
              <MenuItem value='inactive'>Inactive</MenuItem>
            </KbTableFilter>
          </>}
        />}
        emptyState={{
          title: unauthorized ? 'Sign in required' : allErrors.length ? 'Unable to load users' : 'No users found',
          description: unauthorized ? missingTokenMessage : allErrors.length
            ? 'The backend request failed. Try loading users again.'
            : 'No database users match the current search and filters.'
        }}
        pagination={{ page, rowsPerPage: pageSize, totalRows: totalCount, onPageChange: setPage,
          onRowsPerPageChange: nextPageSize => { setPageSize(nextPageSize); resetPage() } }}
      />
    </KbPageShell>
  )
}

export default UsersManagementPage
