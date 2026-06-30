'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Third-party Imports
import { Download } from 'lucide-react'

// Type Imports
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { AuditEvent } from '../types/audit'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import PageHeader from '../shared/components/PageHeader'

// Data Imports
import { emptyAuditEvents } from '../data/auditEvents'

// Util Imports
import { getAuditActionOptions, getAuditUserOptions, getVisibleAuditEvents } from './utils/auditEvents'

const AuditActivityFeed = () => {
  // States
  const [userFilter, setUserFilter] = useState('All users')
  const [actionFilter, setActionFilter] = useState('All actions')
  const [articleSearch, setArticleSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'createdAt', direction: 'desc' })

  // Vars
  const events = emptyAuditEvents

  // Hooks
  const users = useMemo(() => getAuditUserOptions(events), [events])
  const actions = useMemo(() => getAuditActionOptions(events), [events])

  const visibleEvents = useMemo(() => {
    // TODO: connect to backend API.
    // GET /api/kb/audit-logs should accept actorUserId, action, articleId/search, page, sort, and date range.
    return getVisibleAuditEvents({ events, userFilter, actionFilter, articleSearch, sort })
  }, [actionFilter, articleSearch, events, sort, userFilter])

  // Columns
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

  // Handlers
  const handleExport = () => {
    // TODO: connect to backend API.
    // POST /api/kb/audit-logs/export should create an export job and return downloadable file metadata.
  }

  // Render
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
                <CustomTextField
                  select
                  label='User'
                  value={userFilter}
                  onChange={event => setUserFilter(event.target.value)}
                  sx={{ inlineSize: { xs: '100%', md: 190 } }}
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
                  sx={{ inlineSize: { xs: '100%', md: 190 } }}
                >
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
