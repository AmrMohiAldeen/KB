export type HelpJuiceFileKind = 'questions' | 'answers'

export type HelpJuiceValidationSeverity = 'warning' | 'error'

export type HelpJuiceValidationIssue = {
  severity: HelpJuiceValidationSeverity
  message: string
  file?: HelpJuiceFileKind
  rowNumber?: number
}

export type CsvRecord = {
  rowNumber: number
  values: Record<string, string>
}

export type ParsedCsvFile = {
  file: HelpJuiceFileKind
  headers: string[]
  rows: CsvRecord[]
  issues: HelpJuiceValidationIssue[]
}

export type HelpJuiceImportCandidate = {
  sourceQuestionId: string
  sourceAnswerIds: string[]
  sourceAuthorIds: string[]
  title: string
  slug?: string
  sourceDescription?: string
  sourceCategoryId?: string
  sourceIsPublished?: boolean
  sourceCreatedAt?: string
  sourceUpdatedAt?: string
  sourceLanguageId?: string
  sourceLanguageCode?: string
  sourceKeywordNames?: string
  sourceExpirationDate?: string
  sourceViews?: number
  htmlBody: string
  plainTextBody: string
  tiptapJson: unknown
  migrationWarnings: MigrationWarning[]
  tableOfContents: HelpjuiceTocItem[]
  warnings: string[]
  errors: string[]
}

export type HelpJuicePreparedImportPayload = {
  source: 'helpjuice'
  preparedAt: string
  sourceFiles: {
    questionsFileName: string
    answersFileName: string
  }
  candidates: HelpJuiceImportCandidate[]
  warnings: string[]
  errors: string[]
}

export type HelpJuiceImportBuildResult = {
  candidates: HelpJuiceImportCandidate[]
  validationIssues: HelpJuiceValidationIssue[]
}

export const HELPJUICE_QUESTIONS_REQUIRED_COLUMNS = ['id', 'name'] as const
export const HELPJUICE_ANSWERS_REQUIRED_COLUMNS = ['question_id', 'body'] as const
import type { MigrationWarning } from './normalizeHelpjuiceHtml'
import type { HelpjuiceTocItem } from './convertNormalizedHelpjuiceHtml'
