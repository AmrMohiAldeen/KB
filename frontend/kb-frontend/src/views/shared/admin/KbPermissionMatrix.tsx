'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { ShieldAlert } from 'lucide-react'

// Component Imports
import KbSectionCard from '../KbSectionCard'

export type KbPermissionDefinition = {
  key: string
  label: string
  description: string
}

export type KbPermissionRole = {
  key: string
  label: string
  permissions: string[]
}

type KbPermissionMatrixProps = {
  roles: KbPermissionRole[]
  permissions: KbPermissionDefinition[]
}

export const KbPermissionMatrix = ({ roles, permissions }: KbPermissionMatrixProps) => (
  <KbSectionCard
    title='Permission Matrix'
    description='Global authorization must be enforced by the backend. This matrix is a UI view of role coverage, not a security boundary.'
  >
    <Stack spacing={4}>
      <Box
        sx={theme => ({
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          border: `1px solid ${theme.palette.warning.light}`,
          borderRadius: 2,
          bgcolor: 'warning.lighterOpacity',
          color: 'warning.dark',
          p: 3
        })}
      >
        <ShieldAlert size={18} />
        <Typography variant='body2'>
          Backend authorization is mandatory, changing permissions through the UI is not allowed.
        </Typography>
      </Box>

      <TableContainer sx={{ overflowX: 'auto', border: theme => `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
        <Table size='small' aria-label='KB permission matrix' sx={{ minInlineSize: 920 }}>
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {roles.map(role => (
                <TableCell key={role.key} align='center'>
                  {role.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {permissions.map(permission => (
              <TableRow key={permission.key} hover>
                <TableCell sx={{ maxInlineSize: 360 }}>
                  <Typography color='text.primary' sx={{ fontWeight: 700 }}>
                    {permission.label}
                  </Typography>
                </TableCell>
                {roles.map(role => (
                  <TableCell key={role.key} align='center'>
                    <Checkbox checked={role.permissions.includes(permission.key)} disabled size='small' />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  </KbSectionCard>
)

export default KbPermissionMatrix
