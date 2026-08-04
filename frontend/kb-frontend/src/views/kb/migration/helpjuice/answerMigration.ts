import { Editor, type JSONContent } from '@tiptap/core'

import { EMPTY_TIPTAP_DOC } from '../../../../features/editor/import/convertHtmlToTiptap'
import { getEditorExtensions } from '../../../../features/editor/extensions'
import { convertHelpJuiceHtml } from './conversion'
import type { AnswerMigrationResult, CsvRecord } from './types'
import type { MigrationWarning } from './normalizeHelpjuiceHtml'

export const TEXT_CONTENT_SIMILARITY_THRESHOLD = 0.8

const normalizeComparableText = (value: string) =>
  value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

export function extractTiptapText(content: JSONContent): string {
  const parts: string[] = []
  const visit = (node: JSONContent) => {
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    node.content?.forEach(visit)
  }

  visit(content)
  return normalizeComparableText(parts.join(' '))
}

function similarity(source: string, output: string): number {
  const sourceTokens = normalizeComparableText(source).toLowerCase().split(' ').filter(Boolean)
  const outputTokens = normalizeComparableText(output).toLowerCase().split(' ').filter(Boolean)
  if (sourceTokens.length === 0) return 1

  const available = new Map<string, number>()
  outputTokens.forEach(token => available.set(token, (available.get(token) ?? 0) + 1))
  const matched = sourceTokens.reduce((count, token) => {
    const remaining = available.get(token) ?? 0
    if (!remaining) return count
    available.set(token, remaining - 1)
    return count + 1
  }, 0)

  return matched / sourceTokens.length
}

function warning(code: MigrationWarning['code'], message: string, severity: MigrationWarning['severity'] = 'warning'): MigrationWarning {
  return { code, severity, message }
}

export function validateTiptapDocument(content: JSONContent): string[] {
  const errors: string[] = []
  if (!content || content.type !== 'doc') errors.push('The document root must be a doc node.')

  let editor: Editor | null = null
  try {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: getEditorExtensions({ featureFlags: { fileHandler: false } }),
      editable: false,
      content: EMPTY_TIPTAP_DOC
    })
    editor.schema.nodeFromJSON(content)

    const headingIds = new Set<string>()
    const visit = (node: JSONContent, parentType?: string) => {
      const type = node.type ?? ''
      if (!editor?.schema.nodes[type] && type !== 'text') errors.push(`Unsupported node type "${type}".`)
      if (type === 'heading') {
        const id = node.attrs?.id
        if (typeof id !== 'string' || !id) errors.push('Heading nodes require a unique id.')
        else if (headingIds.has(id)) errors.push(`Duplicate heading id "${id}".`)
        else headingIds.add(id)
      }
      if (type === 'text') {
        node.marks?.forEach(mark => {
          if (mark.type === 'link' && typeof mark.attrs?.href !== 'string') errors.push('Link marks require a string href.')
        })
      }
      if (type === 'image' || type === 'youtube') {
        if (typeof node.attrs?.src !== 'string' || /^data:/i.test(node.attrs.src)) errors.push(`${type} nodes require a non-Base64 src.`)
      }
      if (type === 'table') {
        if (!node.content?.length || node.content.some(row => row.type !== 'tableRow')) errors.push('Tables require tableRow children.')
      }
      if (type === 'tableRow') {
        if (!node.content?.length || node.content.some(cell => cell.type !== 'tableCell' && cell.type !== 'tableHeader')) {
          errors.push('Table rows require tableCell or tableHeader children.')
        }
      }
      if (parentType === 'doc' && type === 'text') errors.push('Text nodes cannot be direct document children.')
      node.content?.forEach(child => visit(child, type))
    }
    visit(content)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'The Tiptap schema rejected the document.')
  } finally {
    editor?.destroy()
  }

  return errors
}

export function convertAnswerMigrationRecord(answer: CsvRecord): AnswerMigrationResult & { plainTextBody: string } {
  const answerId = answer.values.id?.trim() || `row-${answer.rowNumber}`
  const questionId = answer.values.question_id?.trim() ?? ''
  const sourceHtml = answer.values.body ?? ''
  const sourceText = answer.values.body_txt ?? ''
  const warnings: MigrationWarning[] = []

  if (!sourceHtml.trim()) {
    warnings.push(warning('EMPTY_ANSWER', 'The answer body is empty; a valid empty editor document was created.'))
    return {
      answerId,
      questionId,
      status: 'warning',
      tiptapJson: EMPTY_TIPTAP_DOC,
      warnings,
      sourceHtmlLength: sourceHtml.length,
      outputTextLength: 0,
      plainTextBody: ''
    }
  }

  try {
    const converted = convertHelpJuiceHtml(sourceHtml)
    warnings.push(...converted.migrationWarnings)
    const tiptapJson = converted.tiptapJson as JSONContent
    const outputText = extractTiptapText(tiptapJson)
    if (converted.errors.length > 0) {
      warnings.push(warning('TIPTAP_SCHEMA_VALIDATION_FAILED', converted.errors.join(' '), 'error'))
      return {
        answerId,
        questionId,
        status: 'failed',
        warnings,
        sourceHtmlLength: sourceHtml.length,
        outputTextLength: outputText.length,
        plainTextBody: outputText
      }
    }
    const schemaErrors = validateTiptapDocument(tiptapJson)

    if (schemaErrors.length > 0) {
      warnings.push(warning('TIPTAP_SCHEMA_VALIDATION_FAILED', schemaErrors.join(' '), 'error'))
      return {
        answerId,
        questionId,
        status: 'failed',
        warnings,
        sourceHtmlLength: sourceHtml.length,
        outputTextLength: outputText.length,
        plainTextBody: outputText
      }
    }

    if (sourceText && similarity(sourceText, outputText) < TEXT_CONTENT_SIMILARITY_THRESHOLD) {
      warnings.push(
        warning(
          'TEXT_CONTENT_MISMATCH',
          `Converted text retained less than ${(TEXT_CONTENT_SIMILARITY_THRESHOLD * 100).toFixed(0)}% of meaningful body_txt content.`
        )
      )
    }

    return {
      answerId,
      questionId,
      status: warnings.length > 0 ? 'warning' : 'success',
      tiptapJson,
      warnings,
      sourceHtmlLength: sourceHtml.length,
      outputTextLength: outputText.length,
      plainTextBody: outputText
    }
  } catch (error) {
    warnings.push(warning('TIPTAP_SCHEMA_VALIDATION_FAILED', error instanceof Error ? error.message : 'Conversion failed.', 'error'))
    return {
      answerId,
      questionId,
      status: 'failed',
      warnings,
      sourceHtmlLength: sourceHtml.length,
      outputTextLength: 0,
      plainTextBody: ''
    }
  }
}

export type AnswerMigrationStatusCounts = Record<AnswerMigrationResult['status'] | 'total' | 'processed', number>

export function getAnswerMigrationStatusCounts(results: readonly AnswerMigrationResult[]): AnswerMigrationStatusCounts {
  return results.reduce<AnswerMigrationStatusCounts>(
    (counts, result) => {
      counts.total += 1
      counts.processed += 1
      counts[result.status] += 1
      return counts
    },
    { total: 0, processed: 0, success: 0, warning: 0, failed: 0 }
  )
}

export function filterAnswerMigrationResults<T extends AnswerMigrationResult>(results: readonly T[], status: 'all' | AnswerMigrationResult['status']): T[] {
  return status === 'all' ? [...results] : results.filter(result => result.status === status)
}

export function formatMigrationWarningDetails(warnings: readonly MigrationWarning[]): string[] {
  return warnings.map(item => `${item.code}: ${item.message}`)
}

export function isCompiledPreviewContent(value: unknown): value is JSONContent {
  return Boolean(value && typeof value === 'object' && (value as JSONContent).type === 'doc')
}
