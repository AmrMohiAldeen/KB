'use client'

import { useMemo, useState } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { UserPlus } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import KbUserDrawer from '@/views/shared/admin/KbUserDrawer'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import type { KbUserRole, UsersType } from '@/types/apps/userTypes'

import { KbPageShell, PageHeader, StatusChip, formatDate, roleLabels } from './KbShared'
import { emptyUsers } from './kbMockData'

const roleOptions: Array<KbUserRole | 'all'> = ['all', 'admin', 'author', 'reviewer', 'contributor', 'viewer']

const UsersManagementPage = () => {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<KbUserRole | 'all'>('all')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'fullName', direction: 'asc' })
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const users = emptyUsers

  const visibleUsers = useMemo(() => {
    // TODO: connect to backend users API.
    // GET /api/kb/users should return SSO-backed users and global role assignments only.
    const needle = search.trim().toLowerCase()

    return [...users]
      .filter(user => (roleFilter === 'all' ? true : user.role === roleFilter))
      .filter(user =>
        needle ? `${user.fullName} ${user.email} ${user.role} ${user.ssoId}`.toLowerCase().includes(needle) : true
      )
      .sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1
        const aValue = String(a[sort.columnId as keyof UsersType] ?? '')
        const bValue = String(b[sort.columnId as keyof UsersType] ?? '')

        return aValue.localeCompare(bValue) * direction
      })
  }, [roleFilter, search, sort, users])

  const columns = useMemo<Array<KbDataTableColumn<UsersType>>>(
    () => [
      {
        id: 'fullName',
        label: 'Name',
        sortable: true,
        render: user => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, minInlineSize: 260 }}>
            <Avatar sx={{ inlineSize: 34, blockSize: 34 }}>{user.fullName.slice(0, 1)}</Avatar>
            <Box sx={{ minInlineSize: 0 }}>
              <Typography color='text.primary' sx={{ fontWeight: 700 }} noWrap>
                {user.fullName}
              </Typography>
              <Typography variant='body2' color='text.secondary' noWrap>
                {user.email}
              </Typography>
            </Box>
          </Box>
        )
      },
      { id: 'role', label: 'Role', sortable: true, render: user => roleLabels[user.role] },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: user => <StatusChip label={user.status} color={user.status === 'active' ? 'success' : 'secondary'} />
      },
      { id: 'ssoId', label: 'SSO ID', sortable: true, render: user => user.ssoId },
      { id: 'createdAt', label: 'Joined', sortable: true, render: user => formatDate(user.createdAt) },
      { id: 'lastLoginAt', label: 'Last Login', sortable: true, render: user => (user.lastLoginAt ? formatDate(user.lastLoginAt) : '-') }
    ],
    []
  )

  const handleAddUser = () => {
    // TODO: connect to backend SSO user provisioning API.
    // POST /api/kb/users should attach an existing SSO identity to one global KB role.
    setDrawerOpen(false)
  }

  return (
    <KbPageShell>
      <PageHeader
        title='Users'
        subtitle='Manage SSO users and global KB roles.'
        actions={
          <Button variant='contained' startIcon={<UserPlus size={18} />} onClick={() => setDrawerOpen(true)}>
            Add User
          </Button>
        }
      />

      <KbDataTable
        ariaLabel='Users table'
        rows={visibleUsers}
        columns={columns}
        getRowId={user => user.id}
        enableSelection
        selectedRowIds={selectedRows}
        onSelectedRowIdsChange={setSelectedRows}
        sort={sort}
        onSortChange={setSort}
        toolbar={
          <KbTableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder='Search users'
            selectedCount={selectedRows.length}
            filters={
              <CustomTextField
                select
                label='Role'
                value={roleFilter}
                onChange={event => setRoleFilter(event.target.value as KbUserRole | 'all')}
                sx={{ inlineSize: { xs: '100%', md: 180 } }}
              >
                {roleOptions.map(option => (
                  <MenuItem key={option} value={option}>
                    {option === 'all' ? 'All roles' : roleLabels[option]}
                  </MenuItem>
                ))}
              </CustomTextField>
            }
          />
        }
        emptyState={{
          title: 'No users loaded',
          description: 'SSO-backed users will appear here after the backend users API is connected.'
        }}
        pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleUsers.length }}
      />

      <KbUserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSubmit={handleAddUser} />
    </KbPageShell>
  )
}

export default UsersManagementPage
