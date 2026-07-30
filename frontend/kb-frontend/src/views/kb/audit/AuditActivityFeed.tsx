'use client'

// React Imports
import { useCallback, useEffect, useMemo, useState } from 'react'

// MUI Imports
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

// Type Imports
import type { ArticleAuditLogResponse } from '@/types/apps/auditLogTypes'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'
import { KbPageShell } from '@/views/shared'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import PageHeader from '../shared/components/PageHeader'

// API and Util Imports
import { describeAuditLogApiError, getAuditLogs } from '@/lib/api/auditLogsApi'
import { auditActionOptions, formatAuditAction, formatAuditDetails, toUtcIso } from './utils/auditEvents'

type AuditActivityFeedProps = {
  /** Supplied by the company SSO/session integration, following the existing API-client convention. */
  accessToken: string
}

const missingTokenMessage = 'Sign in through the company authentication provider before loading audit logs.'

const formatTimestamp = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

const AuditActivityFeed = ({ accessToken }: AuditActivityFeedProps) => {
  // States
  const [logs, setLogs] = useState<ArticleAuditLogResponse[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [userFilter, setUserFilter] = useState('')
  const [debouncedUserFilter, setDebouncedUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [articleSearch, setArticleSearch] = useState('')
  const [debouncedArticleSearch, setDebouncedArticleSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'createdAt', direction: 'desc' })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  // Hooks
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedArticleSearch(articleSearch.trim())
      setDebouncedUserFilter(userFilter.trim())
    }, 350)

    return () => window.clearTimeout(timer)
  }, [articleSearch, userFilter])

  const loadAuditLogs = useCallback(async (signal?: AbortSignal) => {
    if (!accessToken) {
      setLogs([])
      setTotalCount(0)
      setLoading(false)
      setErrors([missingTokenMessage])
      return
    }

    setLoading(true)
    setErrors([])

    try {
      const response = await getAuditLogs({
        article: debouncedArticleSearch || undefined,
        user: debouncedUserFilter || undefined,
        actionType: actionFilter || undefined,
        from: toUtcIso(fromDate),
        to: toUtcIso(toDate),
        page: page + 1,
        pageSize,
        sortDirection: sort.direction
      }, accessToken, signal)

      setLogs(response.items)
      setTotalCount(response.totalCount)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setLogs([])
      setTotalCount(0)
      setErrors(describeAuditLogApiError(error))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [
    accessToken,
    actionFilter,
    debouncedArticleSearch,
    debouncedUserFilter,
    fromDate,
    page,
    pageSize,
    sort.direction,
    toDate
  ])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void loadAuditLogs(controller.signal), 0)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadAuditLogs])

  // Columns
  const columns = useMemo<Array<KbDataTableColumn<ArticleAuditLogResponse>>>(
    () => [
      {
        id: 'createdAt',
        label: 'Timestamp',
        sortable: true,
        render: log => formatTimestamp(log.createdAt)
      },
      {
        id: 'user',
        label: 'User',
        render: log => (
          <>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              {log.actor?.fullName ?? 'System'}
            </Typography>
            {log.actor && (
              <Typography variant='body2' color='text.secondary'>
                {log.actor.userId}
              </Typography>
            )}
          </>
        )
      },
      {
        id: 'action',
        label: 'Action',
        render: log => formatAuditAction(log.actionType)
      },
      {
        id: 'article',
        label: 'Article',
        render: log => log.article ? (
          <>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              {log.article.title}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {log.article.slug}
            </Typography>
          </>
        ) : '—'
      },
      {
        id: 'details',
        label: 'Details',
        render: log => (
          <Typography
            variant='body2'
            color='text.secondary'
            title={formatAuditDetails(log.metadata)}
            sx={{ maxInlineSize: 420, overflowWrap: 'anywhere' }}
          >
            {formatAuditDetails(log.metadata)}
          </Typography>
        )
      }
    ],
    []
  )

  const resetPage = () => setPage(0)

  // Render
  return (
    <KbPageShell>
      <PageHeader
        title='Audit Logs'
        subtitle='Inspect meaningful article, review, publishing, and access-control activity across the KB.'
      />

      <KbValidationSummary title='Audit logs could not be loaded' errors={errors} />

      <KbDataTable
        ariaLabel='Audit logs table'
        loading={loading}
        rows={logs}
        columns={columns}
        getRowId={log => log.auditLogId}
        sort={sort}
        onSortChange={nextSort => {
          setSort(nextSort)
          resetPage()
        }}
        toolbar={
          <KbTableToolbar
            searchValue={articleSearch}
            onSearchChange={value => {
              setArticleSearch(value)
              resetPage()
            }}
            searchPlaceholder='Filter by article title or slug'
            filters={
              <>
                <CustomTextField
                  label='User'
                  value={userFilter}
                  placeholder='Name or email'
                  onChange={event => {
                    setUserFilter(event.target.value)
                    resetPage()
                  }}
                  sx={{ inlineSize: { xs: '100%', md: 190 } }}
                />
                <CustomTextField
                  select
                  label='Action'
                  value={actionFilter}
                  onChange={event => {
                    setActionFilter(event.target.value)
                    resetPage()
                  }}
                  sx={{ inlineSize: { xs: '100%', md: 200 } }}
                >
                  <MenuItem value=''>All actions</MenuItem>
                  {auditActionOptions.map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </CustomTextField>
                <CustomTextField
                  type='datetime-local'
                  label='From'
                  value={fromDate}
                  onChange={event => {
                    setFromDate(event.target.value)
                    resetPage()
                  }}
                  sx={{ inlineSize: { xs: '100%', md: 205 } }}
                />
                <CustomTextField
                  type='datetime-local'
                  label='To'
                  value={toDate}
                  onChange={event => {
                    setToDate(event.target.value)
                    resetPage()
                  }}
                  sx={{ inlineSize: { xs: '100%', md: 205 } }}
                />
              </>
            }
          />
        }
        emptyState={{
          title: 'No audit activity',
          description: 'No audit logs match the current filters.'
        }}
        pagination={{
          page,
          rowsPerPage: pageSize,
          totalRows: totalCount,
          onPageChange: setPage,
          onRowsPerPageChange: nextPageSize => {
            setPageSize(nextPageSize)
            resetPage()
          }
        }}
      />
    </KbPageShell>
  )
}

export default AuditActivityFeed
