import type {
  ArticleExportSource,
  ExportFormat,
  ExportJobResponse
} from '@/types/apps/exportJobTypes'
import { apiBlobRequest, apiRequest } from './http'

export const requestArticleExport = (
  articleId: string,
  source: ArticleExportSource,
  exportType: ExportFormat,
  accessToken: string
) => apiRequest<ExportJobResponse>(
  `/api/export-jobs/articles/${encodeURIComponent(articleId)}`,
  accessToken,
  { method: 'POST', body: JSON.stringify({ exportType, ...source }) }
)

export const requestCategoryExport = (
  categoryId: string,
  exportType: ExportFormat,
  accessToken: string
) => apiRequest<ExportJobResponse>(
  `/api/export-jobs/categories/${encodeURIComponent(categoryId)}`,
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
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

type WaitForExportOptions = {
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

const wait = (milliseconds: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('The export request was cancelled.', 'AbortError'))
    return
  }
  const onAbort = () => {
    window.clearTimeout(timer)
    reject(new DOMException('The export request was cancelled.', 'AbortError'))
  }
  const timer = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort)
    resolve()
  }, milliseconds)
  signal?.addEventListener('abort', onAbort, { once: true })
})

export const waitForExport = async (
  initialJob: ExportJobResponse,
  accessToken: string,
  options: WaitForExportOptions = {}
) => {
  const timeoutMs = options.timeoutMs ?? 65_000
  const pollIntervalMs = options.pollIntervalMs ?? 500
  const deadline = Date.now() + timeoutMs
  let job = initialJob

  while (job.status !== 'Completed' && job.status !== 'Failed') {
    if (Date.now() >= deadline)
      throw new Error(
        `The export job did not finish within ${Math.ceil(timeoutMs / 1000)} seconds and polling was stopped. ` +
        'Try again or contact support.'
      )
    await wait(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())), options.signal)
    job = await getExportJob(job.exportJobId, accessToken, options.signal)
  }

  if (job.status === 'Failed')
    throw new Error(job.errorMessage || 'The export could not be generated.')
  return job
}

export const downloadArticleExport = async (
  articleId: string,
  source: ArticleExportSource,
  exportType: ExportFormat,
  accessToken: string,
  signal?: AbortSignal
) => {
  const job = await waitForExport(
    await requestArticleExport(articleId, source, exportType, accessToken),
    accessToken,
    { signal }
  )
  saveExportBlob(await downloadExport(job.exportJobId, accessToken, signal), job.fileName)
  return job
}
