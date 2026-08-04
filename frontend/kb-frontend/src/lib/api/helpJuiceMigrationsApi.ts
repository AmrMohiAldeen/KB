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
export type HelpJuiceValidationSummary = { totalArticles: number; publishedArticles: number; unpublishedArticles: number; categories: number; categoryDepth: number; articlesMissingAnswers: number; duplicateIds: number; duplicateSlugs: number; invalidCategoryReferences: number; missingMedia: number; availableFiles: string[]; missingRequiredFiles: string[]; unsupportedFiles: string[]; blockingErrorCount: number; warningCount: number }
export type HelpJuiceMigrationResult = { importedItems: number; updatedItems: number; skippedItems: number; failedItems: number; categoryImported: number; categoryUpdated: number; categorySkipped: number; publishedImported: number; draftImported: number; mediaImported: number; mediaReused: number; unresolvedMedia: number; unsupportedData: number; warningCount: number }
export type HelpJuiceMigrationPhase = { phase: string; status: string; totalItems: number; processedItems: number; importedItems: number; updatedItems: number; skippedItems: number; failedItems: number }
export type HelpJuiceMigrationResponse = { status: 'ValidationFailed'|'Completed'|'CompletedWithErrors'; originalFileName: string; startedAt: string; completedAt: string; options: HelpJuiceMigrationOptions; validation: HelpJuiceValidationSummary; result?: HelpJuiceMigrationResult; phases: HelpJuiceMigrationPhase[]; issues: MigrationIssue[] }

const parseJson = (value: string): unknown => { try { return value ? JSON.parse(value) : undefined } catch { return undefined } }

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

export const helpJuiceMigrationsApi = { run: runHelpJuiceMigration }
export type HelpJuiceMigrationsApi = typeof helpJuiceMigrationsApi
