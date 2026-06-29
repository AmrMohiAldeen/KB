// Next Imports
import Link from 'next/link'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const NotAuthorized = () => {
  return (
    <Stack className='min-bs-[100dvh] items-center justify-center p-6'>
      <Card variant='outlined' className='is-full max-is-[560px]'>
        <CardContent>
          <Stack spacing={4} className='items-center text-center'>
            <i className='tabler-shield-lock text-[64px] text-warning' />
            <Stack spacing={1}>
              <Typography className='font-medium text-6xl' color='text.primary'>
                403
              </Typography>
              <Typography variant='h4'>Access restricted</Typography>
              <Typography color='text.secondary'>
                Your global KB role does not include permission to view this page.
              </Typography>
            </Stack>
            <Button href='/articles' component={Link} variant='contained'>
              Back to articles
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}

export default NotAuthorized
