export type ExportFormat = 'PDF' | 'HTML'
export type ExportJobStatus = 'Pending' | 'Processing' | 'Completed' | 'Failed'

export type ExportJobResponse = {
  exportJobId: string
  entityType: 'Article' | 'Category'
  articleId: string | null
  categoryId: string | null
  versionId: string | null
  exportType: ExportFormat
  status: ExportJobStatus
  requestedBy: { userId: string; fullName: string }
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  fileName: string
  downloadUrl: string | null
  errorMessage: string | null
}
