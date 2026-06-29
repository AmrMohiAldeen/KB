'use client'

import { useMemo, useState } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Plus, Search, UserPlus } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import type { KbUserRole } from '@/types/apps/userTypes'

import { MetricStrip, PageHeader, StatusChip, formatDate, roleLabels } from './KbShared'
import { roleDefinitions, sampleUsers } from './kbMockData'

const roleOptions: KbUserRole[] = ['admin', 'author', 'reviewer', 'contributor', 'viewer']

const UsersManagementPage = () => {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [role, setRole] = useState<KbUserRole>('viewer')

  const visibleUsers = useMemo(() => {
    // TODO: connect to backend users API.
    // GET /api/kb/users should return SSO-backed users and global role assignments only.
    const needle = search.trim().toLowerCase()

    return sampleUsers.filter(user =>
      needle ? `${user.fullName} ${user.email} ${user.role} ${user.ssoId}`.toLowerCase().includes(needle) : true
    )
  }, [search])

  const handleAddUser = () => {
    // TODO: connect to backend SSO user provisioning API.
    // POST /api/kb/users should attach an existing SSO identity to one global KB role.
    setDialogOpen(false)
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Users'
        subtitle='Manage SSO users and global KB roles.'
        actions={
          <Button variant='contained' startIcon={<UserPlus size={18} />} onClick={() => setDialogOpen(true)}>
            Add User
          </Button>
        }
      />

      <MetricStrip
        metrics={[
          { label: 'Active users', value: String(sampleUsers.filter(user => user.status === 'active').length) },
          { label: 'Admins', value: String(sampleUsers.filter(user => user.role === 'admin').length) },
          { label: 'Reviewers', value: String(sampleUsers.filter(user => user.role === 'reviewer').length) },
          { label: 'Global roles', value: String(roleDefinitions.length) }
        ]}
      />

      <Card variant='outlined'>
        <CardContent className='pbs-4'>
          <Stack spacing={4}>
            <CustomTextField
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search users'
              fullWidth
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search size={18} />
                    </InputAdornment>
                  )
                }
              }}
            />

            <Box className='overflow-x-auto'>
              <Table size='small' aria-label='Users table'>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>SSO ID</TableCell>
                    <TableCell>Joined</TableCell>
                    <TableCell>Last Login</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleUsers.map(user => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Box className='flex items-center gap-3'>
                          <Avatar>{user.fullName.slice(0, 1)}</Avatar>
                          <Box>
                            <Typography color='text.primary' className='font-medium'>
                              {user.fullName}
                            </Typography>
                            <Typography variant='body2' color='text.secondary'>
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>{roleLabels[user.role]}</TableCell>
                      <TableCell>
                        <StatusChip label={user.status} color={user.status === 'active' ? 'success' : 'secondary'} />
                      </TableCell>
                      <TableCell>{user.ssoId}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>{user.lastLoginAt ? formatDate(user.lastLoginAt) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth='md'>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <Box className='grid grid-cols-1 gap-4 pbs-2 md:grid-cols-2'>
            <CustomTextField label='Full Name' placeholder='Name from SSO profile' fullWidth />
            <CustomTextField label='Email' placeholder='user@example.com' fullWidth />
            <CustomTextField label='SSO Subject ID' placeholder='Identity provider subject' fullWidth />
            <CustomTextField
              select
              label='User Role'
              value={role}
              onChange={event => setRole(event.target.value as KbUserRole)}
              fullWidth
            >
              {roleOptions.map(option => (
                <MenuItem key={option} value={option}>
                  {roleLabels[option]}
                </MenuItem>
              ))}
            </CustomTextField>
          </Box>
        </DialogContent>
        <DialogActions className='pli-6 pbs-0 pbe-6'>
          <Button variant='tonal' color='secondary' onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant='contained' startIcon={<Plus size={18} />} onClick={handleAddUser}>
            Add User
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

export default UsersManagementPage

