'use client'

import { useMemo, useState } from 'react'

import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn, KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import KbTableToolbar from '@/views/shared/tables/KbTableToolbar'

import { KbPageShell, MetricStrip, PageHeader, StatusChip } from './KbShared'
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
  emptyTitle: string
  emptyBody: string
  metrics?: KbMetric[]
  records?: KbRecord[]
}

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
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<KbDataTableSort>({ columnId: 'title', direction: 'asc' })

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

  const visibleRecords = useMemo(() => {
    // TODO: connect search/sort/page values to backend APIs for each KB section table.
    const needle = search.trim().toLowerCase()

    return records.filter(record =>
      needle ? `${record.title} ${record.description} ${record.owner} ${record.status}`.toLowerCase().includes(needle) : true
    )
  }, [records, search])

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
