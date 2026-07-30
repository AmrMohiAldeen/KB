// Next Imports
import Link from 'next/link'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const NotFound = () => {
  return (
    <Stack className='min-bs-[100dvh] items-center justify-center p-6'>
      <Card variant='outlined' className='is-full max-is-[520px]'>
        <CardContent>
          <Stack spacing={4} className='items-center text-center'>
            <i className='tabler-file-unknown text-[64px] text-textSecondary' />
            <Stack spacing={1}>
              <Typography className='font-medium text-6xl' color='text.primary'>
                404
              </Typography>
              <Typography variant='h4'>Page not found</Typography>
              <Typography color='text.secondary'>
                The requested knowledge base page does not exist or is no longer available.
              </Typography>
            </Stack>
            <Button href='/dashboard' component={Link} variant='contained'>
              Back to dashboard
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}

export default NotFound
