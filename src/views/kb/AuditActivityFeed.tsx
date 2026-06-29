'use client'

import { useMemo, useState } from 'react'

import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { Download } from 'lucide-react'

import CustomTextField from '@core/components/mui/TextField'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'

import { KbPageShell, PageHeader } from './KbShared'
import { emptyAuditEvents } from './kbMockData'
import type { AuditEvent } from './kbMockData'

const AuditActivityFeed = () => {
  const [userFilter, setUserFilter] = useState('All users')
  const [actionFilter, setActionFilter] = useState('All actions')
  const [articleSearch, setArticleSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'createdAt', direction: 'desc' })
  const events = emptyAuditEvents

  const users = ['All users', ...Array.from(new Set(events.map(event => event.actorName)))]
  const actions = ['All actions', ...Array.from(new Set(events.map(event => event.action)))]

  const visibleEvents = useMemo(() => {
    // TODO: connect to backend audit log API.
    // GET /api/kb/audit-logs should accept actorUserId, action, articleId/search, page, sort, and date range.
    const needle = articleSearch.trim().toLowerCase()

    return [...events]
      .filter(event => {
        const matchesUser = userFilter === 'All users' || event.actorName === userFilter
        const matchesAction = actionFilter === 'All actions' || event.action === actionFilter
        const matchesArticle = needle ? `${event.articleTitle} ${event.detail}`.toLowerCase().includes(needle) : true

        return matchesUser && matchesAction && matchesArticle
      })
      .sort((a, b) => {
        const direction = sort.direction === 'asc' ? 1 : -1
        const aValue = String(a[sort.columnId as keyof AuditEvent] ?? '')
        const bValue = String(b[sort.columnId as keyof AuditEvent] ?? '')

        if (sort.columnId === 'createdAt') {
          return (new Date(aValue).getTime() - new Date(bValue).getTime()) * direction
        }

        return aValue.localeCompare(bValue) * direction
      })
  }, [actionFilter, articleSearch, events, sort, userFilter])

  const columns = useMemo<Array<KbDataTableColumn<AuditEvent>>>(
    () => [
      { id: 'createdAt', label: 'Time', sortable: true, render: event => event.createdAt },
      { id: 'actorName', label: 'User', sortable: true, render: event => event.actorName },
      { id: 'action', label: 'Action', sortable: true, render: event => event.action },
      {
        id: 'articleTitle',
        label: 'Article',
        sortable: true,
        render: event => (
          <>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              {event.articleTitle}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {event.detail}
            </Typography>
          </>
        )
      }
    ],
    []
  )

  const handleExport = () => {
    // TODO: connect to backend audit export API.
    // POST /api/kb/audit-logs/export should create an export job and return downloadable file metadata.
  }

  return (
    <KbPageShell>
      <PageHeader
        title='Audit Logs'
        subtitle='Inspect publishing, review, content, media, user, and settings activity across the KB.'
        actions={
          <Button variant='contained' startIcon={<Download size={18} />} onClick={handleExport}>
            Export XLSX
          </Button>
        }
      />

      <KbDataTable
        ariaLabel='Audit logs table'
        rows={visibleEvents}
        columns={columns}
        getRowId={event => event.id}
        sort={sort}
        onSortChange={setSort}
        toolbar={
          <KbTableToolbar
            searchValue={articleSearch}
            onSearchChange={setArticleSearch}
            searchPlaceholder='Search by article or detail'
            filters={
              <>
                <CustomTextField select label='User' value={userFilter} onChange={event => setUserFilter(event.target.value)} sx={{ inlineSize: { xs: '100%', md: 190 } }}>
                  {users.map(user => (
                    <MenuItem key={user} value={user}>
                      {user}
                    </MenuItem>
                  ))}
                </CustomTextField>
                <CustomTextField select label='Action' value={actionFilter} onChange={event => setActionFilter(event.target.value)} sx={{ inlineSize: { xs: '100%', md: 190 } }}>
                  {actions.map(action => (
                    <MenuItem key={action} value={action}>
                      {action}
                    </MenuItem>
                  ))}
                </CustomTextField>
              </>
            }
          />
        }
        emptyState={{
          title: 'No activity loaded',
          description: 'Audit events will appear here after the backend audit log API is connected.'
        }}
        pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleEvents.length }}
      />
    </KbPageShell>
  )
}

export default AuditActivityFeed
