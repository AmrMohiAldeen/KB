'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { UserPlus } from 'lucide-react'

// Type Imports
import type { KbUserRole, UsersType } from '@/types/apps/userTypes'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbUserDrawer from '@/views/shared/admin/KbUserDrawer'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'

// Config Imports
import { roleLabels } from '../config/roles'
import { roleOptions } from '../config/users'

// Data Imports
import { emptyUsers } from '../data/users'

// Util Imports
import { formatDate } from '../shared/utils/formatDate'
import { getVisibleUsers } from './utils/userRows'

const UsersManagementPage = () => {
  // States
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<KbUserRole | 'all'>('all')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'fullName', direction: 'asc' })
  const [selectedRows, setSelectedRows] = useState<string[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Vars
  const users = emptyUsers

  // Hooks
  const visibleUsers = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/kb/users should return SSO-backed users and global role assignments only.
    return getVisibleUsers({ users, roleFilter, search, sort })
  }, [roleFilter, search, sort, users])

  // Columns
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
      {
        id: 'lastLoginAt',
        label: 'Last Login',
        sortable: true,
        render: user => (user.lastLoginAt ? formatDate(user.lastLoginAt) : '-')
      }
    ],
    []
  )

  // Handlers
  const handleAddUser = () => {
    // TODO: connect to backend API.
    // POST /api/kb/users should attach an existing SSO identity to one global KB role.
    setDrawerOpen(false)
  }

  // Render
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
          description: 'No user with the selected role or search term was found. Start by adding a new user.'
        }}
        pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleUsers.length }}
      />

      <KbUserDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSubmit={handleAddUser} />
    </KbPageShell>
  )
}

export default UsersManagementPage
