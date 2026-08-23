import { Extension } from '@tiptap/core'

const STYLE_PROPERTIES = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'text-align', 'vertical-align', 'text-indent', 'direction', 'unicode-bidi', 'float',
  'object-fit', 'object-position', 'letter-spacing', 'word-spacing', 'text-transform',
  'text-decoration-line', 'text-decoration-style', 'text-decoration-color',
  'white-space', 'overflow-wrap', 'word-break', 'list-style', 'list-style-type',
  'list-style-position', 'border', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-collapse',
  'border-spacing', 'table-layout', 'background-image'
])

function safeLegacyStyle(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  const declarations: string[] = []
  for (const declaration of value.split(';')) {
    const separator = declaration.indexOf(':')
    if (separator <= 0) continue
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const styleValue = declaration.slice(separator + 1).trim()
    if (!STYLE_PROPERTIES.has(property) || !styleValue || styleValue.length > 240) continue
    if (/(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding)/i.test(styleValue)) continue
    if (property === 'background-image' && !/^url\(['"]?(?:https:\/\/|\/)[^'"()]+['"]?\)$/i.test(styleValue)) continue
    if (property !== 'background-image' && !/^[#(),.%\w\s/'"-]+$/.test(styleValue)) continue
    declarations.push(`${property}: ${styleValue}`)
  }
  return declarations.length ? declarations.join('; ') : null
}

function safeLanguage(value: unknown): string | null {
  const language = String(value ?? '').trim()
  return /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/.test(language) ? language : null
}

function safeAnchor(value: unknown): string | null {
  const anchor = String(value ?? '').trim()
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(anchor) ? anchor : null
}

export const LegacyHelpJuiceFormatting = Extension.create({
  name: 'legacyHelpJuiceFormatting',

  addGlobalAttributes() {
    return [{
      types: [
        'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
        'table', 'tableRow', 'tableCell', 'tableHeader', 'image', 'inlineImage',
        'video', 'documentEmbed', 'externalEmbed', 'textStyle'
      ],
      attributes: {
        lang: {
          default: null,
          parseHTML: element => safeLanguage(element.getAttribute('lang') ?? element.getAttribute('xml:lang')),
          renderHTML: attributes => safeLanguage(attributes.lang) ? { lang: safeLanguage(attributes.lang) } : {}
        },
        id: {
          default: null,
          parseHTML: element => safeAnchor(element.getAttribute('id') ?? element.getAttribute('name')),
          renderHTML: attributes => safeAnchor(attributes.id) ? { id: safeAnchor(attributes.id) } : {}
        },
        legacyStyle: {
          default: null,
          parseHTML: element => safeLegacyStyle(element.getAttribute('style')),
          renderHTML: attributes => {
            const style = safeLegacyStyle(attributes.legacyStyle)
            return style ? { style } : {}
          }
        }
      }
    }]
  }
})
