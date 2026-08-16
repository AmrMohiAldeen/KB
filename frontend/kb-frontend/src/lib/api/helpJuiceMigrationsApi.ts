import { ApiError, getApiBaseUrl, normalizeAccessToken, type ProblemDetails } from './http'

export type HelpJuiceConflictBehavior = 'Skip' | 'UpdateExisting' | 'CreateCopy'
export type HelpJuiceMigrationOptions = {
  importPublished: boolean
  importUnpublishedAsDrafts: boolean
  importCategories: boolean
  importMedia: boolean
  preserveTimestamps: boolean
  conflictBehavior: HelpJuiceConflictBehavior
}
export type MigrationIssue = { id: string; severity: 'Error' | 'Warning'; fileName?: string; rowNumber?: number; externalEntityType?: string; externalId?: string; errorCode: string; message: string; sourceDataSummary?: string; createdAt: string }
export type HelpJuiceMigrationPreviewArticle = {
  externalId: string
  questionRowNumber: number
  answerExternalId?: string
  answerRowNumber?: number
  title: string
  slug: string
  description?: string
  isPublished: boolean
  isArchived: boolean
  createdAt?: string
  updatedAt?: string
  categoryExternalId?: string
  categoryLocation?: string
  contentHtml: string
  contentTextLength: number
  sourceMetadata: Record<string, string>
  issues: MigrationIssue[]
}
export type HelpJuiceMigrationPreviewResponse = {
  previewLimit: number
  sourceArticleCount: number
  sourceCategoryCount: number
  isLimited: boolean
  availableFiles: string[]
  missingRequiredFiles: string[]
  unsupportedFiles: string[]
  packageIssues: MigrationIssue[]
  articles: HelpJuiceMigrationPreviewArticle[]
}
export type HelpJuiceValidationSummary = { totalArticles: number; publishedArticles: number; unpublishedArticles: number; categories: number; categoryDepth: number; articlesMissingAnswers: number; duplicateIds: number; duplicateSlugs: number; invalidCategoryReferences: number; missingMedia: number; availableFiles: string[]; missingRequiredFiles: string[]; unsupportedFiles: string[]; blockingErrorCount: number; warningCount: number }
export type HelpJuiceMigrationResult = { importedItems: number; updatedItems: number; skippedItems: number; failedItems: number; categoryImported: number; categoryUpdated: number; categorySkipped: number; publishedImported: number; draftImported: number; archivedImported: number; mediaImported: number; mediaReused: number; unresolvedMedia: number; unsupportedData: number; warningCount: number }
export type HelpJuiceMigrationPhase = { phase: string; status: string; totalItems: number; processedItems: number; importedItems: number; updatedItems: number; skippedItems: number; failedItems: number }
export type HelpJuiceMigrationResponse = { jobId: string; status: 'ValidationFailed'|'Completed'|'CompletedWithErrors'; originalFileName: string; startedAt: string; completedAt: string; options: HelpJuiceMigrationOptions; validation: HelpJuiceValidationSummary; result?: HelpJuiceMigrationResult; phases: HelpJuiceMigrationPhase[]; issues: MigrationIssue[] }
export type HelpJuiceDiagnosticDownload = { blob: Blob; fileName: string; totalRecords?: number; errorCount?: number; warningCount?: number; status?: 'Completed' | 'Partial' }

const parseJson = (value: string): unknown => { try { return value ? JSON.parse(value) : undefined } catch { return undefined } }

export const previewHelpJuiceMigration = async (files: File[], accessToken: string): Promise<HelpJuiceMigrationPreviewResponse> => {
  const token = normalizeAccessToken(accessToken)
  if (!token) throw new ApiError(401, { title: 'Unauthorized', detail: 'Authentication is required.' })
  const form = new FormData()
  files.forEach(file => form.append('files', file, file.webkitRelativePath || file.name))
  const response = await fetch(`${getApiBaseUrl()}/api/migrations/helpjuice/preview`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form
  })
  const body = parseJson(await response.text())
  if (!response.ok) throw new ApiError(response.status, body as ProblemDetails | undefined)
  return body as HelpJuiceMigrationPreviewResponse
}

export const runHelpJuiceMigration = (files: File[], options: HelpJuiceMigrationOptions, accessToken: string,
  onProgress?: (percent: number) => void): { promise: Promise<HelpJuiceMigrationResponse>; cancel: () => void } => {
  const request = new XMLHttpRequest()
  const promise = new Promise<HelpJuiceMigrationResponse>((resolve, reject) => {
    const token = normalizeAccessToken(accessToken)
    if (!token) { reject(new ApiError(401, { title: 'Unauthorized', detail: 'Authentication is required.' })); return }
    const form = new FormData()
    files.forEach(file => form.append('files', file, file.webkitRelativePath || file.name))
    form.append('options', JSON.stringify(options))
    request.open('POST', `${getApiBaseUrl()}/api/migrations/helpjuice`)
    request.setRequestHeader('Accept', 'application/json')
    request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100))) }
    request.onload = () => {
      const body = parseJson(request.responseText)
      if (request.status >= 200 && request.status < 300) resolve(body as HelpJuiceMigrationResponse)
      else reject(new ApiError(request.status, body as ProblemDetails | undefined))
    }
    request.onerror = () => reject(new ApiError(0, { title: 'Network error', detail: 'The migration request failed. Already committed rows may remain.' }))
    request.onabort = () => reject(new DOMException('The migration request was cancelled.', 'AbortError'))
    request.send(form)
  })
  return { promise, cancel: () => request.abort() }
}

export const runHelpJuiceDiagnostic = (files: File[], accessToken: string,
  onProgress?: (percent: number) => void, onScanning?: () => void): { promise: Promise<HelpJuiceDiagnosticDownload>; cancel: () => void } => {
  const request = new XMLHttpRequest()
  const promise = new Promise<HelpJuiceDiagnosticDownload>((resolve, reject) => {
    const token = normalizeAccessToken(accessToken)
    if (!token) { reject(new ApiError(401, { title: 'Unauthorized', detail: 'Authentication is required.' })); return }
    const form = new FormData()
    files.forEach(file => form.append('files', file, file.webkitRelativePath || file.name))
    request.open('POST', `${getApiBaseUrl()}/api/migrations/helpjuice/diagnostics`)
    request.responseType = 'blob'
    request.setRequestHeader('Accept', 'text/csv')
    request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)))
    }
    request.upload.onload = () => { onProgress?.(100); onScanning?.() }
    request.onload = async () => {
      const response = request.response instanceof Blob ? request.response : new Blob()
      if (request.status >= 200 && request.status < 300) {
        resolve({
          blob: response,
          fileName: responseFileName(request.getResponseHeader('Content-Disposition')) ?? `helpjuice-migration-diagnostic-${new Date().toISOString().slice(0, 10)}.csv`,
          totalRecords: optionalNumber(request.getResponseHeader('X-HelpJuice-Diagnostic-Records')),
          errorCount: optionalNumber(request.getResponseHeader('X-HelpJuice-Diagnostic-Errors')),
          warningCount: optionalNumber(request.getResponseHeader('X-HelpJuice-Diagnostic-Warnings')),
          status: request.getResponseHeader('X-HelpJuice-Diagnostic-Status') === 'Partial' ? 'Partial' : 'Completed'
        })
      } else {
        const body = parseJson(await response.text())
        reject(new ApiError(request.status, body as ProblemDetails | undefined))
      }
    }
    request.onerror = () => reject(new ApiError(0, { title: 'Network error', detail: 'The diagnostic scan request failed.' }))
    request.onabort = () => reject(new DOMException('The diagnostic scan was cancelled.', 'AbortError'))
    request.send(form)
  })
  return { promise, cancel: () => request.abort() }
}

const optionalNumber = (value: string | null): number | undefined => {
  const parsed = value === null ? Number.NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
const responseFileName = (contentDisposition: string | null): string | undefined => {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) { try { return decodeURIComponent(encoded) } catch { return encoded } }
  return contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1]
}

export const helpJuiceMigrationsApi = { preview: previewHelpJuiceMigration, run: runHelpJuiceMigration, diagnostic: runHelpJuiceDiagnostic }
export type HelpJuiceMigrationsApi = typeof helpJuiceMigrationsApi
