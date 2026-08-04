import { convertAnswerMigrationRecord } from './answerMigration'
import {
  HELPJUICE_ANSWERS_REQUIRED_COLUMNS,
  HELPJUICE_QUESTIONS_REQUIRED_COLUMNS,
  type CsvRecord,
  type HelpJuiceImportBuildResult,
  type HelpJuicePreparedImportPayload,
  type HelpJuiceValidationIssue,
  type ParsedCsvFile
} from './types'
import { validateRequiredColumns } from './csv'

type BuildHelpJuiceImportInput = {
  questions: ParsedCsvFile
  answers: ParsedCsvFile
}

type CreatePayloadInput = {
  result: HelpJuiceImportBuildResult
  questionsFileName: string
  answersFileName: string
}

type HelpJuiceAnswerRow = {
  rowNumber: number
  sourceAnswerId: string
  sourceQuestionId: string
  sourceAuthorId?: string
  body: string
  row: CsvRecord
}

const field = (row: CsvRecord, key: string) => row.values[key] ?? ''

const trimmedField = (row: CsvRecord, key: string) => field(row, key).trim()

const optionalField = (row: CsvRecord, key: string) => {
  const value = trimmedField(row, key)

  return value || undefined
}

const issue = (
  severity: HelpJuiceValidationIssue['severity'],
  message: string,
  file?: HelpJuiceValidationIssue['file'],
  rowNumber?: number
): HelpJuiceValidationIssue => ({
  severity,
  message,
  file,
  rowNumber
})

function toAnswerRows(answers: ParsedCsvFile): {
  answerRows: HelpJuiceAnswerRow[]
  validationIssues: HelpJuiceValidationIssue[]
} {
  const validationIssues: HelpJuiceValidationIssue[] = []
  const answerRows: HelpJuiceAnswerRow[] = []

  answers.rows.forEach(row => {
    const sourceQuestionId = trimmedField(row, 'question_id')
    const body = field(row, 'body')
    const sourceAnswerId = trimmedField(row, 'id') || `row-${row.rowNumber}`

    if (!sourceQuestionId) {
      validationIssues.push(
        issue('error', `answers.csv row ${row.rowNumber} is missing required question_id.`, 'answers', row.rowNumber)
      )
    }

    if (!body.trim()) {
      validationIssues.push(
        issue('warning', `answers.csv row ${row.rowNumber} has an empty body and will produce an empty editor document.`, 'answers', row.rowNumber)
      )
    }

    answerRows.push({
      rowNumber: row.rowNumber,
      sourceAnswerId,
      sourceQuestionId,
      sourceAuthorId: optionalField(row, 'user_id'),
      body,
      row
    })
  })

  return { answerRows, validationIssues }
}

export function buildHelpJuiceImport(input: BuildHelpJuiceImportInput): HelpJuiceImportBuildResult {
  const validationIssues: HelpJuiceValidationIssue[] = [
    ...input.questions.issues,
    ...input.answers.issues,
    ...validateRequiredColumns(input.questions, HELPJUICE_QUESTIONS_REQUIRED_COLUMNS),
    ...validateRequiredColumns(input.answers, HELPJUICE_ANSWERS_REQUIRED_COLUMNS)
  ]
  const { answerRows, validationIssues: answerValidationIssues } = toAnswerRows(input.answers)
  const answersByQuestionId = new Map<string, HelpJuiceAnswerRow[]>()

  validationIssues.push(...answerValidationIssues)

  answerRows.forEach(answer => {
    const current = answersByQuestionId.get(answer.sourceQuestionId) ?? []

    current.push(answer)
    answersByQuestionId.set(answer.sourceQuestionId, current)
  })

  const questionIds = new Set(input.questions.rows.map(row => trimmedField(row, 'id')).filter(Boolean))

  answerRows.forEach(answer => {
    if (!questionIds.has(answer.sourceQuestionId)) {
      validationIssues.push(
        issue(
          'warning',
          `answers.csv row ${answer.rowNumber} references question_id "${answer.sourceQuestionId}", but no matching question exists.`,
          'answers',
          answer.rowNumber
        )
      )
    }
  })

  const questionsById = new Map(input.questions.rows.map(row => [trimmedField(row, 'id'), row]))
  const answerResults = answerRows.map(answer => {
    const converted = convertAnswerMigrationRecord(answer.row)
    const question = questionsById.get(answer.sourceQuestionId)
    return { ...converted, title: question ? trimmedField(question, 'name') || undefined : undefined }
  })

  return {
    answerResults,
    validationIssues
  }
}

export function createHelpJuicePreparedImportPayload({
  result,
  questionsFileName,
  answersFileName
}: CreatePayloadInput): HelpJuicePreparedImportPayload {
  // This payload remains a client-side preview; the authoritative package is sent once to the migration job API.
  const candidateWarnings = result.answerResults.flatMap(record =>
    record.warnings.map(warning => `${record.answerId}: ${warning.code}: ${warning.message}`)
  )
  const candidateErrors = result.answerResults
    .filter(record => record.status === 'failed')
    .flatMap(record => record.warnings.map(warning => `${record.answerId}: ${warning.code}: ${warning.message}`))

  return {
    source: 'helpjuice',
    preparedAt: new Date().toISOString(),
    sourceFiles: {
      questionsFileName,
      answersFileName
    },
    answerResults: result.answerResults,
    warnings: [
      ...result.validationIssues
        .filter(validationIssue => validationIssue.severity === 'warning')
        .map(validationIssue => validationIssue.message),
      ...candidateWarnings
    ],
    errors: [
      ...result.validationIssues
        .filter(validationIssue => validationIssue.severity === 'error')
        .map(validationIssue => validationIssue.message),
      ...candidateErrors
    ]
  }
}
