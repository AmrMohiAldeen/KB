import type { JSONContent } from '@tiptap/core'

import type { MigrationWarning } from './normalizeHelpjuiceHtml'

export type HelpJuiceFileKind = 'questions' | 'answers' | 'categories' | 'categorizations' | 'uploads'

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

export type AnswerMigrationResult = {
  answerId: string
  questionId: string
  status: 'success' | 'warning' | 'failed'
  tiptapJson?: JSONContent
  warnings: MigrationWarning[]
  sourceHtmlLength: number
  outputTextLength: number
}

export type AnswerMigrationReviewRecord = AnswerMigrationResult & {
  title?: string
  plainTextBody: string
}

export type HelpJuicePreparedImportPayload = {
  source: 'helpjuice'
  preparedAt: string
  sourceFiles: {
    questionsFileName: string
    answersFileName: string
  }
  answerResults: AnswerMigrationReviewRecord[]
  warnings: string[]
  errors: string[]
}

export type HelpJuiceImportBuildResult = {
  answerResults: AnswerMigrationReviewRecord[]
  validationIssues: HelpJuiceValidationIssue[]
}

export const HELPJUICE_QUESTIONS_REQUIRED_COLUMNS = ['id', 'name'] as const
export const HELPJUICE_ANSWERS_REQUIRED_COLUMNS = ['question_id', 'body'] as const
