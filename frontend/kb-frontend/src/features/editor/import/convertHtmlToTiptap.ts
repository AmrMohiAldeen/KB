import { Editor, type JSONContent } from '@tiptap/core'

import { getEditorExtensions } from '../extensions'
import { sanitizePastedHTMLWithResult } from '../paste'

export type HtmlToTiptapConversionResult = {
  json: JSONContent
  sanitizedHtml: string
  warnings: string[]
  errors: string[]
}

export const EMPTY_TIPTAP_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
}

const SANITIZER_FAILURE_MESSAGES: Record<string, string> = {
  'too-large': 'HTML is too large for the current client-side sanitizer.',
  'too-many-nodes': 'HTML has too many nodes for the current client-side sanitizer.',
  'too-deep': 'HTML is nested too deeply for the current client-side sanitizer.',
  'unsupported-environment': 'HTML conversion requires a browser DOM environment.',
  'parse-error': 'HTML could not be parsed by the client-side sanitizer.'
}

export function convertHtmlToTiptapJson(html: string): HtmlToTiptapConversionResult {
  if (typeof document === 'undefined') {
    return {
      json: EMPTY_TIPTAP_DOC,
      sanitizedHtml: '',
      warnings: [],
      errors: [SANITIZER_FAILURE_MESSAGES['unsupported-environment']]
    }
  }

  const sanitized = sanitizePastedHTMLWithResult(html)

  if (!sanitized.ok) {
    return {
      json: EMPTY_TIPTAP_DOC,
      sanitizedHtml: '',
      warnings: [],
      errors: [SANITIZER_FAILURE_MESSAGES[sanitized.reason] ?? 'HTML could not be sanitized for import.']
    }
  }

  const editor = new Editor({
    element: document.createElement('div'),
    extensions: getEditorExtensions({
      featureFlags: {
        fileHandler: false
      }
    }),
    content: sanitized.html || '<p></p>',
    editable: false
  })

  const json = editor.getJSON()

  editor.destroy()

  return {
    json,
    sanitizedHtml: sanitized.html,
    warnings: [],
    errors: []
  }
}

export function stripHtmlToPlainText(html: string): string {
  if (!html.trim()) return ''

  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const document = new DOMParser().parseFromString(html, 'text/html')

  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
