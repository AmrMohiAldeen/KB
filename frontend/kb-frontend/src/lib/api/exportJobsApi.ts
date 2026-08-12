import type { ExportFormat, ExportJobResponse } from '@/types/apps/exportJobTypes'
import { apiBlobRequest, apiRequest } from './http'

export const requestExport = (
  entityType: 'article' | 'category',
  entityId: string,
  exportType: ExportFormat,
  accessToken: string
) => apiRequest<ExportJobResponse>(
  `/api/export-jobs/${entityType === 'article' ? 'articles' : 'categories'}/${encodeURIComponent(entityId)}`,
  accessToken,
  { method: 'POST', body: JSON.stringify({ exportType }) }
)

export const getExportJob = (jobId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ExportJobResponse>(`/api/export-jobs/${encodeURIComponent(jobId)}`, accessToken, { signal })

export const downloadExport = (jobId: string, accessToken: string, signal?: AbortSignal) =>
  apiBlobRequest(`/api/export-jobs/${encodeURIComponent(jobId)}/download`, accessToken, signal)

export const saveExportBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
