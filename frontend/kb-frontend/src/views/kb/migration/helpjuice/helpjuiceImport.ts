import { convertHelpJuiceHtml } from './conversion'
import {
  HELPJUICE_ANSWERS_REQUIRED_COLUMNS,
  HELPJUICE_QUESTIONS_REQUIRED_COLUMNS,
  type CsvRecord,
  type HelpJuiceImportBuildResult,
  type HelpJuiceImportCandidate,
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
}

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

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

function parseHelpJuiceBoolean(value: string): boolean | undefined {
  if (!value.trim()) return undefined

  if (/^true$/i.test(value.trim())) return true
  if (/^false$/i.test(value.trim())) return false

  return undefined
}

function parseHelpJuiceNumber(value: string): number | undefined {
  if (!value.trim()) return undefined

  const normalized = value.replace(/,/g, '').trim()
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? parsed : undefined
}

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
        issue('error', `answers.csv row ${row.rowNumber} is missing required body.`, 'answers', row.rowNumber)
      )
    }

    if (!sourceQuestionId || !body.trim()) return

    answerRows.push({
      rowNumber: row.rowNumber,
      sourceAnswerId,
      sourceQuestionId,
      sourceAuthorId: optionalField(row, 'user_id'),
      body
    })
  })

  return { answerRows, validationIssues }
}

function combineAnswerBodies(answers: HelpJuiceAnswerRow[]) {
  return answers
    .map((answer, index) => {
      if (index === 0) return answer.body

      return [
        '<hr data-helpjuice-answer-separator="true" />',
        `<p><strong>Additional HelpJuice answer ${index + 1}</strong></p>`,
        answer.body
      ].join('\n')
    })
    .join('\n')
}

function candidateFromQuestion(row: CsvRecord, answers: HelpJuiceAnswerRow[]): HelpJuiceImportCandidate {
  const warnings: string[] = []
  const errors: string[] = []
  const sourceQuestionId = trimmedField(row, 'id')
  const title = trimmedField(row, 'name')
  const sourceIsPublishedRaw = trimmedField(row, 'is_published')
  const sourceViewsRaw = trimmedField(row, 'views')
  const sourceIsPublished = parseHelpJuiceBoolean(sourceIsPublishedRaw)
  const sourceViews = parseHelpJuiceNumber(sourceViewsRaw)

  if (!sourceQuestionId) errors.push(`questions.csv row ${row.rowNumber} is missing required id.`)
  if (!title) errors.push(`questions.csv row ${row.rowNumber} is missing required name.`)

  if (sourceIsPublishedRaw && sourceIsPublished === undefined) {
    warnings.push(`questions.csv row ${row.rowNumber} has invalid is_published value "${sourceIsPublishedRaw}".`)
  }

  if (sourceViewsRaw && sourceViews === undefined) {
    warnings.push(`questions.csv row ${row.rowNumber} has invalid views value "${sourceViewsRaw}".`)
  }

  if (answers.length === 0) {
    warnings.push('No matching answer body was found for this question.')
  }

  if (answers.length > 1) {
    warnings.push(`${answers.length} answers were combined into one article body.`)
  }

  const htmlBody = combineAnswerBodies(answers)
  const converted = convertHelpJuiceHtml(htmlBody)

  warnings.push(...converted.warnings)
  errors.push(...converted.errors)

  return {
    sourceQuestionId: sourceQuestionId || `row-${row.rowNumber}`,
    sourceAnswerIds: answers.map(answer => answer.sourceAnswerId),
    sourceAuthorIds: uniqueStrings(answers.map(answer => answer.sourceAuthorId ?? '')),
    title: title || `Untitled HelpJuice question ${row.rowNumber}`,
    slug: optionalField(row, 'codename'),
    sourceDescription: optionalField(row, 'description'),
    sourceCategoryId: optionalField(row, 'category_id'),
    sourceIsPublished,
    sourceCreatedAt: optionalField(row, 'created_at'),
    sourceUpdatedAt: optionalField(row, 'updated_at'),
    sourceLanguageId: optionalField(row, 'language_id'),
    sourceLanguageCode: optionalField(row, 'language_code'),
    sourceKeywordNames: optionalField(row, 'joined_tag_names'),
    sourceExpirationDate: optionalField(row, 'next_expiration_on'),
    sourceViews,
    htmlBody,
    plainTextBody: converted.plainTextBody,
    tiptapJson: converted.tiptapJson,
    migrationWarnings: converted.migrationWarnings,
    tableOfContents: converted.tableOfContents,
    warnings,
    errors
  }
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

  const candidates = input.questions.rows.map(row => {
    const questionAnswers = answersByQuestionId.get(trimmedField(row, 'id')) ?? []

    return candidateFromQuestion(row, questionAnswers)
  })

  return {
    candidates,
    validationIssues
  }
}

export function createHelpJuicePreparedImportPayload({
  result,
  questionsFileName,
  answersFileName
}: CreatePayloadInput): HelpJuicePreparedImportPayload {
  // TODO: Connect to the migration backend to save converted Tiptap JSON.
  // TODO: Connect to the migration backend to store migration warnings.
  // TODO: Connect to the migration backend to update migration job progress.
  const candidateWarnings = result.candidates.flatMap(candidate =>
    candidate.warnings.map(warning => `${candidate.sourceQuestionId}: ${warning}`)
  )
  const candidateErrors = result.candidates.flatMap(candidate =>
    candidate.errors.map(error => `${candidate.sourceQuestionId}: ${error}`)
  )

  return {
    source: 'helpjuice',
    preparedAt: new Date().toISOString(),
    sourceFiles: {
      questionsFileName,
      answersFileName
    },
    candidates: result.candidates,
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
