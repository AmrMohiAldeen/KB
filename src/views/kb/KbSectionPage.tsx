import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import type { ChipProps } from '@mui/material/Chip'

export type KbMetric = {
  label: string
  value: string
  helper?: string
}

export type KbRecord = {
  id: string
  title: string
  description: string
  status: string
  statusColor?: ChipProps['color']
  owner: string
  updatedAt: string
  meta?: string
}

export type KbSectionConfig = {
  title: string
  description: string
  entityName: string
  primaryAction: string
  metrics: KbMetric[]
  records: KbRecord[]
}

const KbSectionPage = ({ title, description, entityName, primaryAction, metrics, records }: KbSectionConfig) => {
  return (
    <Stack spacing={6}>
      <Box className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <Box>
          <Typography variant='h4' color='text.primary'>
            {title}
          </Typography>
          <Typography color='text.secondary' className='max-is-[760px]'>
            {description}
          </Typography>
        </Box>
        <Stack direction='row' spacing={2}>
          {/* TODO: Replace with backend API call to create the relevant KB entity.
              Expected action: POST endpoint receives a typed payload for this page's entity and returns the saved entity id plus rowVersion when concurrency applies. */}
          <Button variant='contained' disabled>
            {primaryAction}
          </Button>
        </Stack>
      </Box>

      <Box className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {metrics.map(metric => (
          <Card key={metric.label} variant='outlined'>
            <CardContent>
              <Typography variant='h5'>{metric.value}</Typography>
              <Typography color='text.primary'>{metric.label}</Typography>
              {metric.helper && (
                <Typography variant='body2' color='text.secondary'>
                  {metric.helper}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>

      <Card variant='outlined'>
        <CardContent className='pbs-4'>
          <Box className='flex items-center justify-between gap-4 mbe-4'>
            <Typography variant='h6'>{entityName}</Typography>
            {/* TODO: Replace with backend API call to filter and sort this listing.
                Expected action: GET endpoint accepts search, status, owner, pagination, and sort params and returns rows plus totalCount. */}
            <Button variant='outlined' disabled>
              Filter
            </Button>
          </Box>
          <Box className='overflow-x-auto'>
            <Table size='small' aria-label={`${entityName} table`}>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Updated</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map(record => (
                  <TableRow key={record.id} hover>
                    <TableCell>
                      <Typography color='text.primary' className='font-medium'>
                        {record.title}
                      </Typography>
                      <Typography variant='body2' color='text.secondary'>
                        {record.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size='small' label={record.status} color={record.statusColor ?? 'default'} variant='outlined' />
                    </TableCell>
                    <TableCell>{record.owner}</TableCell>
                    <TableCell>{record.updatedAt}</TableCell>
                    <TableCell>{record.meta ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  )
}

export default KbSectionPage
