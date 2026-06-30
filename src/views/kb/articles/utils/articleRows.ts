// Type Imports
import type { KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { ArticleFilter, KbListRow } from '../../types/articles'

export const rowMatchesFilter = (row: KbListRow, filter: ArticleFilter) => {
  if (filter === 'Everything') return true
  if (row.kind === 'category') return true
  if (filter === 'Followed') return row.article.followed

  return row.article.status === filter
}

export const getArticleFilterCounts = (rows: KbListRow[], filters: ArticleFilter[]) =>
  filters.reduce(
    (counts, filter) => ({
      ...counts,
      [filter]: rows.filter(row => rowMatchesFilter(row, filter)).length
    }),
    {} as Record<ArticleFilter, number>
  )

const rowText = (row: KbListRow) =>
  row.kind === 'category'
    ? row.name
    : `${row.article.title} ${row.article.categoryPath} ${row.article.ownerName} ${row.article.status}`

const getSortValue = (row: KbListRow, columnId: string) => {
  if (row.kind === 'category') {
    if (columnId === 'updated') return row.updatedAt
    if (columnId === 'views') return 0
    if (columnId === 'owner') return 'Organization'
    if (columnId === 'status') return row.articleCount

    return row.name
  }

  if (columnId === 'updated') return row.article.updatedAt
  if (columnId === 'views') return row.article.views
  if (columnId === 'owner') return row.article.ownerName
  if (columnId === 'status') return row.article.status

  return row.article.title
}

const compareRows = (sort: KbDataTableSort) => (a: KbListRow, b: KbListRow) => {
  const aValue = getSortValue(a, sort.columnId)
  const bValue = getSortValue(b, sort.columnId)
  const direction = sort.direction === 'asc' ? 1 : -1

  if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction

  if (sort.columnId === 'updated') {
    return (new Date(String(aValue)).getTime() - new Date(String(bValue)).getTime()) * direction
  }

  return String(aValue).localeCompare(String(bValue)) * direction
}

export const getVisibleArticleRows = ({
  rows,
  filter,
  search,
  sort
}: {
  rows: KbListRow[]
  filter: ArticleFilter
  search: string
  sort: KbDataTableSort
}) => {
  const needle = search.trim().toLowerCase()

  return [...rows]
    .filter(row => rowMatchesFilter(row, filter))
    .filter(row => (needle ? rowText(row).toLowerCase().includes(needle) : true))
    .sort(compareRows(sort))
}
