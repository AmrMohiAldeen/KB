import {
  convertHtmlToTiptapJson,
  EMPTY_TIPTAP_DOC,
  stripHtmlToPlainText
} from '../../../../features/editor/import/convertHtmlToTiptap'

type HelpJuiceHtmlConversionResult = {
  tiptapJson: unknown
  plainTextBody: string
  warnings: string[]
  errors: string[]
}

function normalizeHelpJuiceHtml(html: string): string {
  const normalized = html.replace(/^\uFEFF/, '').trim()

  // TODO: normalize embedded HelpJuice media once the backend media import flow exists.
  // TODO: rewrite internal HelpJuice links to KB article links after migrated article IDs are available.
  // TODO: map custom HelpJuice formatting/classes to supported editor marks or nodes.
  // TODO: review unsupported HelpJuice HTML blocks that the generic sanitizer currently unwraps or removes.

  return normalized
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
  const normalizedHtml = normalizeHelpJuiceHtml(html)
  const conversion = normalizedHtml ? convertHtmlToTiptapJson(normalizedHtml) : null

  return {
    tiptapJson: conversion?.json ?? EMPTY_TIPTAP_DOC,
    plainTextBody: stripHtmlToPlainText(normalizedHtml),
    warnings: [...detectHelpJuiceHtmlWarnings(normalizedHtml), ...(conversion?.warnings ?? [])],
    errors: conversion?.errors ?? []
  }
}

export function convertHelpJuiceHtmlToTiptapJson(html: string): unknown {
  return convertHelpJuiceHtml(html).tiptapJson
}
