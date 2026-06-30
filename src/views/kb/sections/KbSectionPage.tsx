'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Type Imports
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { KbRecord, KbSectionConfig } from '../types/sections'

// Component Imports
import { KbPageShell } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'
import MetricStrip from '../shared/components/MetricStrip'
import PageHeader from '../shared/components/PageHeader'
import StatusChip from '../shared/components/StatusChip'

// Util Imports
import { getVisibleSectionRecords } from './utils/sectionRecords'

const KbSectionPage = ({
  title,
  description,
  entityName,
  primaryAction,
  emptyTitle,
  emptyBody,
  metrics = [],
  records = []
}: KbSectionConfig) => {
  // States
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'title', direction: 'asc' })

  // Hooks
  const visibleRecords = useMemo(() => {
    // TODO: connect to backend API.
    // Search, sort, and page values should be sent to each KB section endpoint.
    return getVisibleSectionRecords(records, search)
  }, [records, search])

  // Columns
  const columns = useMemo<Array<KbDataTableColumn<KbRecord>>>(
    () => [
      {
        id: 'title',
        label: 'Name',
        sortable: true,
        render: record => (
          <>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              {record.title}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {record.description}
            </Typography>
          </>
        )
      },
      {
        id: 'status',
        label: 'Status',
        sortable: true,
        render: record => <StatusChip label={record.status} color={record.statusColor} />
      },
      { id: 'owner', label: 'Owner', sortable: true, render: record => record.owner },
      { id: 'updatedAt', label: 'Updated', sortable: true, render: record => record.updatedAt },
      { id: 'meta', label: 'Details', render: record => record.meta ?? '-' }
    ],
    []
  )

  // Render
  return (
    <KbPageShell>
      <PageHeader
        title={title}
        subtitle={description}
        actions={
          <Button variant='contained' disabled>
            {/* TODO: connect to backend API. */}
            {primaryAction}
          </Button>
        }
      />

      <MetricStrip metrics={metrics} />

      <KbDataTable
        ariaLabel={`${entityName} table`}
        rows={visibleRecords}
        columns={columns}
        getRowId={record => record.id}
        sort={sort}
        onSortChange={setSort}
        toolbar={
          <KbTableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={`Search ${entityName.toLowerCase()}`}
            actions={
              <Button variant='outlined' color='secondary' disabled>
                Filter
              </Button>
            }
          />
        }
        emptyState={{ title: emptyTitle, description: emptyBody }}
        pagination={{ page: 0, rowsPerPage: 10, totalRows: visibleRecords.length }}
      />
    </KbPageShell>
  )
}

export default KbSectionPage
