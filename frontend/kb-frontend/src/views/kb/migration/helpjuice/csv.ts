import type {
  CsvRecord,
  HelpJuiceFileKind,
  HelpJuiceValidationIssue,
  ParsedCsvFile
} from './types'

type RawCsvRow = {
  fields: string[]
  rowNumber: number
}

const EXTRA_COLUMN_PREFIX = '__extra_'

const fileLabel: Record<HelpJuiceFileKind, string> = {
  questions: 'questions.csv',
  answers: 'answers.csv',
  categories: 'categories.csv',
  categorizations: 'categorizations.csv',
  uploads: 'uploads.csv'
}

const isLineBreak = (character: string) => character === '\n' || character === '\r'

const isBlankRawRow = (fields: string[]) => fields.every(field => field.trim() === '')

const issue = (
  file: HelpJuiceFileKind,
  severity: HelpJuiceValidationIssue['severity'],
  message: string,
  rowNumber?: number
): HelpJuiceValidationIssue => ({
  file,
  severity,
  message,
  rowNumber
})

function tokenizeCsv(text: string, file: HelpJuiceFileKind): { rows: RawCsvRow[]; issues: HelpJuiceValidationIssue[] } {
  const rows: RawCsvRow[] = []
  const issues: HelpJuiceValidationIssue[] = []
  const source = text.replace(/^\uFEFF/, '')
  const fields: string[] = []
  let field = ''
  let inQuotes = false
  let quoteClosed = false
  let justClosedRow = true
  let lineNumber = 1
  let rowNumber = 1

  const pushField = () => {
    fields.push(field)
    field = ''
    quoteClosed = false
  }

  const pushRow = () => {
    rows.push({ fields: [...fields], rowNumber })
    fields.length = 0
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          quoteClosed = true
        }
      } else {
        field += character
        if (isLineBreak(character)) {
          if (character === '\r' && source[index + 1] === '\n') {
            field += '\n'
            index += 1
          }

          lineNumber += 1
        }
      }

      justClosedRow = false
      continue
    }

    if (quoteClosed && character !== ',' && !isLineBreak(character)) {
      if (!/\s/.test(character)) {
        issues.push(
          issue(
            file,
            'warning',
            `${fileLabel[file]} row ${rowNumber} has unexpected text after a closing quote.`,
            rowNumber
          )
        )
      }

      if (!/\s/.test(character)) field += character
      justClosedRow = false
      continue
    }

    if (character === '"') {
      if (field === '') {
        inQuotes = true
      } else {
        issues.push(
          issue(file, 'warning', `${fileLabel[file]} row ${rowNumber} has a quote inside an unquoted field.`, rowNumber)
        )
        field += character
      }

      justClosedRow = false
      continue
    }

    if (character === ',') {
      pushField()
      justClosedRow = false
      continue
    }

    if (isLineBreak(character)) {
      pushField()
      pushRow()

      if (character === '\r' && source[index + 1] === '\n') {
        index += 1
      }

      lineNumber += 1
      rowNumber = lineNumber
      justClosedRow = true
      continue
    }

    field += character
    justClosedRow = false
  }

  if (inQuotes) {
    issues.push(issue(file, 'error', `${fileLabel[file]} row ${rowNumber} has an unclosed quoted field.`, rowNumber))
  }

  if (field !== '' || fields.length > 0 || !justClosedRow) {
    pushField()
    pushRow()
  }

  return { rows, issues }
}

function normalizeHeaders(headerRow: RawCsvRow | undefined, file: HelpJuiceFileKind): {
  headers: string[]
  issues: HelpJuiceValidationIssue[]
} {
  if (!headerRow || isBlankRawRow(headerRow.fields)) {
    return {
      headers: [],
      issues: [issue(file, 'error', `${fileLabel[file]} must include a header row.`)]
    }
  }

  const issues: HelpJuiceValidationIssue[] = []
  const headers = headerRow.fields.map(header => header.trim().replace(/^\uFEFF/, ''))
  const seenHeaders = new Set<string>()

  headers.forEach((header, index) => {
    if (!header) {
      issues.push(
        issue(file, 'warning', `${fileLabel[file]} has an empty header at column ${index + 1}.`, headerRow.rowNumber)
      )

      return
    }

    if (seenHeaders.has(header)) {
      issues.push(issue(file, 'error', `${fileLabel[file]} has a duplicate "${header}" column.`, headerRow.rowNumber))
    }

    seenHeaders.add(header)
  })

  return { headers, issues }
}

function mapRows(rawRows: RawCsvRow[], headers: string[], file: HelpJuiceFileKind): {
  rows: CsvRecord[]
  issues: HelpJuiceValidationIssue[]
} {
  const rows: CsvRecord[] = []
  const issues: HelpJuiceValidationIssue[] = []

  rawRows.forEach(rawRow => {
    if (isBlankRawRow(rawRow.fields)) return

    if (rawRow.fields.length !== headers.length) {
      issues.push(
        issue(
          file,
          'warning',
          `${fileLabel[file]} row ${rawRow.rowNumber} has ${rawRow.fields.length} columns; expected ${headers.length}.`,
          rawRow.rowNumber
        )
      )
    }

    const values: Record<string, string> = {}

    headers.forEach((header, index) => {
      if (!header) return

      values[header] = rawRow.fields[index] ?? ''
    })

    rawRow.fields.slice(headers.length).forEach((value, index) => {
      values[`${EXTRA_COLUMN_PREFIX}${index + 1}`] = value
    })

    rows.push({ rowNumber: rawRow.rowNumber, values })
  })

  if (headers.length > 0 && rows.length === 0) {
    issues.push(issue(file, 'warning', `${fileLabel[file]} does not contain any data rows.`))
  }

  return { rows, issues }
}

export function parseHelpJuiceCsv(text: string, file: HelpJuiceFileKind): ParsedCsvFile {
  const tokenized = tokenizeCsv(text, file)
  const normalizedHeaders = normalizeHeaders(tokenized.rows[0], file)
  const mappedRows = mapRows(tokenized.rows.slice(1), normalizedHeaders.headers, file)

  return {
    file,
    headers: normalizedHeaders.headers,
    rows: mappedRows.rows,
    issues: [...tokenized.issues, ...normalizedHeaders.issues, ...mappedRows.issues]
  }
}

export function validateRequiredColumns(
  parsedFile: ParsedCsvFile,
  requiredColumns: readonly string[]
): HelpJuiceValidationIssue[] {
  const headerSet = new Set(parsedFile.headers)

  return requiredColumns
    .filter(column => !headerSet.has(column))
    .map(column =>
      issue(parsedFile.file, 'error', `${fileLabel[parsedFile.file]} is missing required "${column}" column.`)
    )
}
