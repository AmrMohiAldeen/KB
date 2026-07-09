// Type Imports
import type { KbRecord } from '../../types/sections'

export const getVisibleSectionRecords = (records: KbRecord[], search: string) => {
  const needle = search.trim().toLowerCase()

  return records.filter(record =>
    needle ? `${record.title} ${record.description} ${record.owner} ${record.status}`.toLowerCase().includes(needle) : true
  )
}
