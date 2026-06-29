import Box from '@mui/material/Box'

import KbPermissionMatrix from '@/views/shared/admin/KbPermissionMatrix'
import KbRoleCard from '@/views/shared/admin/KbRoleCard'

import { KbPageShell, PageHeader } from './KbShared'
import { permissionDefinitions, roleDefinitions } from './kbMockData'

const RolesManagementPage = () => {
  // TODO: connect to backend roles API.
  // GET /api/kb/roles should return global roles and permissions only. Category-specific roles are intentionally not used.
  return (
    <KbPageShell>
      <PageHeader title='Roles' subtitle='Review global KB roles and permission coverage.' />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 4 }}>
        {roleDefinitions.map(role => (
          <KbRoleCard
            key={role.role}
            label={role.label}
            summary={role.summary}
            permissions={role.permissions}
          />
        ))}
      </Box>

      <KbPermissionMatrix
        roles={roleDefinitions.map(role => ({
          key: role.role,
          label: role.label,
          permissions: role.permissions
        }))}
        permissions={permissionDefinitions}
      />
    </KbPageShell>
  )
}

export default RolesManagementPage
