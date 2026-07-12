import {
  convertHtmlToTiptapJson,
  EMPTY_TIPTAP_DOC,
  stripHtmlToPlainText
} from '../../../../features/editor/import/convertHtmlToTiptap'
import { normalizeHelpjuiceHtml } from './normalizeHelpjuiceHtml'
import type { MigrationWarning } from './normalizeHelpjuiceHtml'
import {
  buildHelpjuiceToc,
  prepareHelpjuiceSemanticHtml,
  replaceHelpjuiceMediaPlaceholders,
  type HelpjuiceTocItem
} from './convertNormalizedHelpjuiceHtml'

export { normalizeHelpjuiceHtml, type MigrationWarning } from './normalizeHelpjuiceHtml'

export type HelpJuiceHtmlConversionResult = {
  tiptapJson: unknown
  plainTextBody: string
  migrationWarnings: MigrationWarning[]
  tableOfContents: HelpjuiceTocItem[]
  warnings: string[]
  errors: string[]
}

function detectHelpJuiceHtmlWarnings(html: string): string[] {
  const warnings: string[] = []

  if (/<(?:img|iframe|video|audio|embed|object)\b/i.test(html)) {
    warnings.push('Contains embedded media that is not migrated in this client-side step.')
  }

  if (/\bhref=(["'])[^"']*(?:helpjuice|\/questions\/|\/articles\/)[^"']*\1/i.test(html)) {
    warnings.push('May contain internal HelpJuice links that need backend URL rewriting later.')
  }

  if (/\bclass=(["'])[^"']*(?:helpjuice|hj-|fr-|ql-)[^"']*\1/i.test(html)) {
    warnings.push('Contains source-specific classes that may need a later formatting pass.')
  }

  return warnings
}

export function convertHelpJuiceHtml(html: string): HelpJuiceHtmlConversionResult {
  const normalized = normalizeHelpjuiceHtml(html)
  const prepared = prepareHelpjuiceSemanticHtml(normalized.html)
  const conversion = prepared.html ? convertHtmlToTiptapJson(prepared.html) : null
  const tiptapJson = conversion
    ? replaceHelpjuiceMediaPlaceholders(conversion.json, prepared.placeholders)
    : EMPTY_TIPTAP_DOC
  const migrationWarnings = [...normalized.warnings, ...prepared.warnings]

  return {
    tiptapJson,
    plainTextBody: stripHtmlToPlainText(prepared.html),
    migrationWarnings,
    tableOfContents: buildHelpjuiceToc(tiptapJson),
    warnings: [
      ...migrationWarnings.map(item => `${item.code}: ${item.message}`),
      ...detectHelpJuiceHtmlWarnings(prepared.html),
      ...(conversion?.warnings ?? [])
    ],
    errors: conversion?.errors ?? []
  }
}

export function convertHelpJuiceHtmlToTiptapJson(html: string): unknown {
  return convertHelpJuiceHtml(html).tiptapJson
}
