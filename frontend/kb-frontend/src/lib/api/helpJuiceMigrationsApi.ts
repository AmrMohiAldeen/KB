import { ApiError, apiBlobRequest, apiRequest, getApiBaseUrl, normalizeAccessToken, type ProblemDetails } from './http'

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
export type HelpJuiceValidationSummary = { totalArticles: number; publishedArticles: number; unpublishedArticles: number; categories: number; categoryDepth: number; articlesMissingAnswers: number; duplicateIds: number; duplicateSlugs: number; invalidCategoryReferences: number; missingMedia: number; availableFiles: string[]; missingRequiredFiles: string[]; unsupportedFiles: string[]; blockingErrorCount: number; warningCount: number }
export type HelpJuiceMigrationResult = { categoryImported: number; categoryUpdated: number; categorySkipped: number; publishedImported: number; draftImported: number; mediaImported: number; mediaReused: number; unresolvedMedia: number; unsupportedData: number; warningCount: number }
export type HelpJuiceMigrationJob = { id: string; type: string; status: 'Pending'|'Validating'|'Ready'|'Running'|'Completed'|'CompletedWithErrors'|'Failed'|'Cancelled'; originalFileName: string; requestedByUserId: string; requestedByName?: string; requestedAt: string; startedAt?: string; completedAt?: string; currentPhase: string; totalItems: number; processedItems: number; importedItems: number; updatedItems: number; skippedItems: number; failedItems: number; cancellationRequested: boolean; options: HelpJuiceMigrationOptions; validation?: HelpJuiceValidationSummary; result?: HelpJuiceMigrationResult; failureCode?: string; failureMessage?: string; issues: MigrationIssue[] }
export type MigrationAccepted = { jobId: string; status: string; statusUrl: string }

const parseJson = (value: string): unknown => { try { return value ? JSON.parse(value) : undefined } catch { return undefined } }

export const validateHelpJuicePackage = (files: File[], options: HelpJuiceMigrationOptions, accessToken: string,
  onProgress?: (percent: number) => void): { promise: Promise<MigrationAccepted>; cancel: () => void } => {
  const request = new XMLHttpRequest()
  const promise = new Promise<MigrationAccepted>((resolve, reject) => {
    const token = normalizeAccessToken(accessToken)
    if (!token) { reject(new ApiError(401, { title: 'Unauthorized', detail: 'Authentication is required.' })); return }
    const form = new FormData(); files.forEach(file => form.append('files', file, file.webkitRelativePath || file.name)); form.append('options', JSON.stringify(options))
    request.open('POST', `${getApiBaseUrl()}/api/migrations/helpjuice/validate`)
    request.setRequestHeader('Accept', 'application/json'); request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100))) }
    request.onload = () => { const body = parseJson(request.responseText); if (request.status >= 200 && request.status < 300) resolve(body as MigrationAccepted); else reject(new ApiError(request.status, body as ProblemDetails | undefined)) }
    request.onerror = () => reject(new ApiError(0, { title: 'Network error', detail: 'The migration package could not be uploaded.' }))
    request.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'))
    request.send(form)
  })
  return { promise, cancel: () => request.abort() }
}

export const startHelpJuiceMigration = (jobId: string, options: HelpJuiceMigrationOptions, token: string) =>
  apiRequest<MigrationAccepted>('/api/migrations/helpjuice', token, { method: 'POST', body: JSON.stringify({ jobId, options }) })
export const getHelpJuiceMigration = (jobId: string, token: string, signal?: AbortSignal) =>
  apiRequest<HelpJuiceMigrationJob>(`/api/migrations/helpjuice/${encodeURIComponent(jobId)}`, token, { signal })
export const cancelHelpJuiceMigration = (jobId: string, token: string) =>
  apiRequest<void>(`/api/migrations/helpjuice/${encodeURIComponent(jobId)}/cancel`, token, { method: 'POST' })
export const downloadHelpJuiceErrors = (jobId: string, format: 'csv'|'json', token: string) =>
  apiBlobRequest(`/api/migrations/helpjuice/${encodeURIComponent(jobId)}/errors?format=${format}`, token)

export const helpJuiceMigrationsApi = { validate: validateHelpJuicePackage, start: startHelpJuiceMigration, get: getHelpJuiceMigration, cancel: cancelHelpJuiceMigration, downloadErrors: downloadHelpJuiceErrors }
export type HelpJuiceMigrationsApi = typeof helpJuiceMigrationsApi
