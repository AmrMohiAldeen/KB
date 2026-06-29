'use client'

import { useMemo, useState } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Download, History, Search } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'

import { PageHeader } from './KbShared'
import { auditEvents } from './kbMockData'

const AuditActivityFeed = () => {
  const [userFilter, setUserFilter] = useState('All users')
  const [actionFilter, setActionFilter] = useState('All actions')
  const [articleSearch, setArticleSearch] = useState('')

  const users = ['All users', ...Array.from(new Set(auditEvents.map(event => event.actor)))]
  const actions = ['All actions', ...Array.from(new Set(auditEvents.map(event => event.action)))]

  const visibleEvents = useMemo(() => {
    // TODO: connect to backend audit log API.
    // GET /api/kb/audit-logs should accept actorUserId, action, articleId/search, page, and date range.
    const needle = articleSearch.trim().toLowerCase()

    return auditEvents.filter(event => {
      const matchesUser = userFilter === 'All users' || event.actor === userFilter
      const matchesAction = actionFilter === 'All actions' || event.action === actionFilter
      const matchesArticle = needle ? `${event.article} ${event.detail}`.toLowerCase().includes(needle) : true

      return matchesUser && matchesAction && matchesArticle
    })
  }, [actionFilter, articleSearch, userFilter])

  const handleExport = () => {
    // TODO: connect to backend audit export API.
    // POST /api/kb/audit-logs/export should create an export job and return downloadable file metadata.
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        title='Activities'
        subtitle='See publishing, review, content, media, user, and settings activity across the KB.'
        actions={
          <Button variant='contained' startIcon={<Download size={18} />} onClick={handleExport}>
            Export XLSX
          </Button>
        }
      />

      <Card variant='outlined'>
        <CardContent>
          <Box className='grid grid-cols-1 gap-4 md:grid-cols-[220px_220px_minmax(0,1fr)]'>
            <CustomTextField
              select
              label='User'
              value={userFilter}
              onChange={event => setUserFilter(event.target.value)}
            >
              {users.map(user => (
                <MenuItem key={user} value={user}>
                  {user}
                </MenuItem>
              ))}
            </CustomTextField>
            <CustomTextField
              select
              label='Action'
              value={actionFilter}
              onChange={event => setActionFilter(event.target.value)}
            >
              {actions.map(action => (
                <MenuItem key={action} value={action}>
                  {action}
                </MenuItem>
              ))}
            </CustomTextField>
            <CustomTextField
              label='Article'
              value={articleSearch}
              onChange={event => setArticleSearch(event.target.value)}
              placeholder='Search by article or detail'
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
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={3}>
        {visibleEvents.map(event => (
          <Card key={event.id} variant='outlined'>
            <CardContent className='p-4'>
              <Box className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between'>
                <Box className='flex items-start gap-3'>
                  <Avatar className='bg-[var(--mui-palette-primary-lightOpacity)] text-primary'>
                    {event.actor === 'System' ? <History size={18} /> : event.actor.slice(0, 1)}
                  </Avatar>
                  <Box>
                    <Typography color='text.primary' className='font-medium'>
                      {event.actor}
                    </Typography>
                    <Typography color='text.primary'>
                      {event.action} <span className='font-medium'>{event.article}</span>
                    </Typography>
                    <Typography variant='body2' color='text.secondary'>
                      {event.detail}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant='body2' color='text.secondary'>
                  {event.createdAt}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}

export default AuditActivityFeed

