import { describe, expect, it } from 'vitest'

import { parseHelpJuiceCsv } from './csv'
import { buildHelpJuiceImport } from './helpjuiceImport'
import {
  convertAnswerMigrationRecord,
  filterAnswerMigrationResults,
  formatMigrationWarningDetails,
  getAnswerMigrationStatusCounts,
  isCompiledPreviewContent,
  validateTiptapDocument
} from './answerMigration'

describe('Helpjuice answer-level migration review', () => {
  it('uses the CSV parser for quoted multiline HTML, commas and escaped quotes', () => {
    const csv = [
      'id,question_id,body,body_txt',
      'a1,q1,"<p title=""""quoted, title"""">Line one',
      'Line two</p>","Line one Line two"'
    ].join('\n')
    const parsed = parseHelpJuiceCsv(csv, 'answers')

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].values.body).toContain('quoted, title')
    expect(parsed.rows[0].values.body).toContain('Line one\nLine two')
  })

  it('accepts a CSV field above 2 MB without splitting it into rows', () => {
    const body = `<p>${'x'.repeat(2 * 1024 * 1024 + 32)}</p>`
    const parsed = parseHelpJuiceCsv(`id,question_id,body\na1,q1,"${body}"`, 'answers')

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].values.body).toHaveLength(body.length)
  })

  it('continues after a malformed quoted record', () => {
    const parsed = parseHelpJuiceCsv(
      ['id,question_id,body', 'broken,q1,"<p>bad</p>" unexpected', 'valid,q2,"<p>good</p>"'].join('\n'),
      'answers'
    )

    expect(parsed.rows.map(row => row.values.id)).toEqual(['broken', 'valid'])
    expect(parsed.issues.some(issue => issue.severity === 'warning')).toBe(true)
  })

  it('creates a warning empty document for an empty answer body', () => {
    const result = convertAnswerMigrationRecord({ rowNumber: 2, values: { id: 'a-empty', question_id: 'q1', body: '' } })

    expect(result.status).toBe('warning')
    expect(result.tiptapJson).toMatchObject({ type: 'doc' })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'EMPTY_ANSWER' }))
  })

  it('rejects Base64 media from the final record document', () => {
    const result = convertAnswerMigrationRecord({
      rowNumber: 2,
      values: { id: 'a-media', question_id: 'q1', body: '<img src="data:image/png;base64,AAAA">' }
    })

    expect(result.status).toBe('warning')
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'BROKEN_IMAGE' }))
    expect(JSON.stringify(result.tiptapJson)).not.toContain('base64')
  })

  it('keeps duplicate answer bodies as separate records', () => {
    const questions = parseHelpJuiceCsv('id,name\nq1,Article', 'questions')
    const answers = parseHelpJuiceCsv('id,question_id,body\na1,q1,"<p>Same</p>"\na2,q1,"<p>Same</p>"', 'answers')
    const result = buildHelpJuiceImport({ questions, answers })

    expect(result.answerResults.map(record => record.answerId)).toEqual(['a1', 'a2'])
    expect(result.answerResults).toHaveLength(2)
  })

  it('warns only when meaningful body_txt text is missing from the final document', () => {
    const result = convertAnswerMigrationRecord({
      rowNumber: 2,
      values: { id: 'a-text', question_id: 'q1', body: '<p>Kept text</p>', body_txt: 'Kept text missing words' }
    })

    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'TEXT_CONTENT_MISMATCH' }))
  })

  it('rejects invalid schema documents without stopping other record conversion', () => {
    const errors = validateTiptapDocument({ type: 'doc', content: [{ type: 'unsupportedNode' }] })
    const failed = convertAnswerMigrationRecord({
      rowNumber: 2,
      values: { id: 'too-large', question_id: 'q1', body: 'x'.repeat(1_000_001) }
    })
    const valid = convertAnswerMigrationRecord({ rowNumber: 3, values: { id: 'good', question_id: 'q1', body: '<p>Good</p>' } })

    expect(errors.length).toBeGreaterThan(0)
    expect(failed.status).toBe('failed')
    expect(failed.warnings).toContainEqual(expect.objectContaining({ code: 'TIPTAP_SCHEMA_VALIDATION_FAILED' }))
    expect(valid.status).toBe('success')
  })

  it('calculates review status counts, filters records, and formats warning details', () => {
    const records = [
      convertAnswerMigrationRecord({ rowNumber: 2, values: { id: 'ok', question_id: 'q1', body: '<p>OK</p>' } }),
      convertAnswerMigrationRecord({ rowNumber: 3, values: { id: 'empty', question_id: 'q1', body: '' } })
    ]
    const counts = getAnswerMigrationStatusCounts(records)

    expect(counts).toMatchObject({ total: 2, processed: 2, success: 1, warning: 1, failed: 0 })
    expect(filterAnswerMigrationResults(records, 'warning').map(record => record.answerId)).toEqual(['empty'])
    expect(formatMigrationWarningDetails(records[1].warnings)[0]).toContain('EMPTY_ANSWER')
  })

  it('provides compiled Tiptap content for the read-only preview', () => {
    const result = convertAnswerMigrationRecord({ rowNumber: 2, values: { id: 'preview', question_id: 'q1', body: '<h2>Preview</h2><p>Article</p>' } })

    expect(isCompiledPreviewContent(result.tiptapJson)).toBe(true)
  })
})
