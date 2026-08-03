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

export const CSV_PREVIEW_DATA_ROW_LIMIT = 100

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

type CsvPreviewScanState = {
  dataRows: number
  fieldStarted: boolean
  headerComplete: boolean
  inQuotes: boolean
  pendingQuote: boolean
  rowHasContent: boolean
  skipLineFeed: boolean
}

const createCsvPreviewScanState = (): CsvPreviewScanState => ({
  dataRows: 0,
  fieldStarted: false,
  headerComplete: false,
  inQuotes: false,
  pendingQuote: false,
  rowHasContent: false,
  skipLineFeed: false
})

function scanCsvPreviewChunk(
  text: string,
  state: CsvPreviewScanState,
  maximumDataRows: number
): number | undefined {
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (state.skipLineFeed) {
      state.skipLineFeed = false
      if (character === '\n') continue
    }

    if (state.inQuotes) {
      if (character === '"') {
        state.inQuotes = false
        state.pendingQuote = true
      } else if (!/\s/.test(character)) {
        state.rowHasContent = true
      }

      continue
    }

    if (state.pendingQuote) {
      if (character === '"') {
        state.inQuotes = true
        state.pendingQuote = false
        state.rowHasContent = true
        continue
      }

      state.pendingQuote = false
    }

    if (character === '"' && !state.fieldStarted) {
      state.fieldStarted = true
      state.inQuotes = true
      continue
    }

    if (character === ',') {
      state.fieldStarted = false
      continue
    }

    if (isLineBreak(character)) {
      if (state.headerComplete) {
        if (state.rowHasContent) state.dataRows += 1
      } else {
        state.headerComplete = true
      }

      state.fieldStarted = false
      state.rowHasContent = false
      state.skipLineFeed = character === '\r'

      if (state.dataRows >= maximumDataRows) return index + 1
      continue
    }

    state.fieldStarted = true
    if (!/\s/.test(character)) state.rowHasContent = true
  }

  return undefined
}

export async function parseHelpJuiceCsvPreview(
  stream: ReadableStream<Uint8Array>,
  file: HelpJuiceFileKind,
  maximumDataRows = CSV_PREVIEW_DATA_ROW_LIMIT
): Promise<ParsedCsvFile> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const state = createCsvPreviewScanState()
  const textParts: string[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      const decoded = decoder.decode(value, { stream: !done })
      const cutoff = scanCsvPreviewChunk(decoded, state, maximumDataRows)

      textParts.push(cutoff === undefined ? decoded : decoded.slice(0, cutoff))

      if (cutoff !== undefined) {
        await reader.cancel()
        break
      }

      if (done) break
    }
  } finally {
    reader.releaseLock()
  }

  return parseHelpJuiceCsv(textParts.join(''), file)
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
