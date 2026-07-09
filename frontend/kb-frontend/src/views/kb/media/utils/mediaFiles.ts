// Type Imports
import type { KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { MediaFile } from '../../types/media'

const compareMediaFiles = (sort: KbDataTableSort) => (a: MediaFile, b: MediaFile) => {
  const direction = sort.direction === 'asc' ? 1 : -1
  const aValue = String(a[sort.columnId as keyof MediaFile] ?? '')
  const bValue = String(b[sort.columnId as keyof MediaFile] ?? '')

  return aValue.localeCompare(bValue) * direction
}

export const getVisibleMediaFiles = ({
  files,
  search,
  sort
}: {
  files: MediaFile[]
  search: string
  sort: KbDataTableSort
}) => {
  const needle = search.trim().toLowerCase()

  return [...files]
    .filter(file =>
      needle ? `${file.fileName} ${file.mimeType} ${file.uploadedByName}`.toLowerCase().includes(needle) : true
    )
    .sort(compareMediaFiles(sort))
}
