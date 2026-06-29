import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ShieldCheck } from 'lucide-react'

import { MetricStrip, PageHeader } from './KbShared'
import { roleDefinitions } from './kbMockData'

const RolesManagementPage = () => {
  // TODO: connect to backend roles API.
  // GET /api/kb/roles should return global roles and permissions only. Category-specific roles are intentionally not used.
  return (
    <Stack spacing={6}>
      <PageHeader title='Roles' subtitle='Review global KB roles and permission coverage.' />

      <MetricStrip
        metrics={[
          { label: 'Global roles', value: String(roleDefinitions.length) },
          { label: 'Category roles', value: '0' },
          { label: 'Assignable roles', value: '5' },
          { label: 'SSO managed', value: 'Yes' }
        ]}
      />

      <Box className='grid grid-cols-1 gap-5 lg:grid-cols-2'>
        {roleDefinitions.map(role => (
          <Card key={role.role} variant='outlined'>
            <CardContent>
              <Stack spacing={4}>
                <Box className='flex items-start gap-3'>
                  <ShieldCheck size={24} className='text-primary' />
                  <Box>
                    <Typography variant='h6'>{role.label}</Typography>
                    <Typography color='text.secondary'>{role.summary}</Typography>
                  </Box>
                </Box>
                <Typography variant='body2' color='text.secondary'>
                  {role.users} users assigned
                </Typography>
                <Stack direction='row' spacing={2} className='flex-wrap'>
                  {role.permissions.map(permission => (
                    <Chip key={permission} label={permission} size='small' variant='tonal' color='primary' />
                  ))}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  )
}

export default RolesManagementPage

