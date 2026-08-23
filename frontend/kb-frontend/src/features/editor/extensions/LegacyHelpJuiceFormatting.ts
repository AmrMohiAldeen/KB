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

function safeDirection(value: unknown): 'ltr' | 'rtl' | 'auto' | null {
  const direction = String(value ?? '').trim().toLowerCase()
  return direction === 'ltr' || direction === 'rtl' || direction === 'auto' ? direction : null
}

function safeAlignment(value: unknown): 'left' | 'center' | 'right' | null {
  const alignment = String(value ?? '').trim().toLowerCase()
  return alignment === 'left' || alignment === 'center' || alignment === 'right' ? alignment : null
}

function safeDimension(value: unknown): string | null {
  const dimension = String(value ?? '').trim().toLowerCase()
  return /^(?:\d+(?:\.\d+)?(?:px|%|pt|in|cm|mm|em|rem))$/.test(dimension) ? dimension : null
}

function safeDownload(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length <= 240 && !/[\u0000-\u001f\\/]/.test(name) ? name : null
}

function alignmentStyle(value: unknown): string | null {
  const alignment = safeAlignment(value)
  if (alignment === 'center') return 'margin-left: auto; margin-right: auto'
  if (alignment === 'right') return 'margin-left: auto; margin-right: 0'
  if (alignment === 'left') return 'margin-left: 0; margin-right: auto'
  return null
}

const SAFE_IFRAME_PERMISSIONS = new Set([
  'accelerometer', 'autoplay', 'clipboard-write', 'encrypted-media',
  'gyroscope', 'picture-in-picture', 'web-share', 'fullscreen'
])

function safePermissions(value: unknown): string | null {
  const permissions = String(value ?? '').split(';')
    .map(permission => permission.trim().split(/\s+/)[0]?.toLowerCase())
    .filter((permission): permission is string => Boolean(permission) && SAFE_IFRAME_PERMISSIONS.has(permission))
  return permissions.length ? [...new Set(permissions)].join('; ') : null
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
    }, {
      types: ['textStyle'],
      attributes: {
        dir: {
          default: null,
          parseHTML: element => safeDirection(element.getAttribute('dir')),
          renderHTML: attributes => safeDirection(attributes.dir) ? { dir: safeDirection(attributes.dir) } : {}
        }
      }
    }, {
      types: ['link'],
      attributes: {
        download: {
          default: null,
          parseHTML: element => element.hasAttribute('download') ? safeDownload(element.getAttribute('download') ?? '') : null,
          renderHTML: attributes => safeDownload(attributes.download) != null ? { download: safeDownload(attributes.download) } : {}
        }
      }
    }, {
      types: ['table'],
      attributes: {
        minHeight: {
          default: null,
          parseHTML: element => safeDimension(element.getAttribute('data-table-min-height') ?? element.style.minHeight),
          renderHTML: attributes => safeDimension(attributes.minHeight)
            ? { 'data-table-min-height': safeDimension(attributes.minHeight), style: `min-height: ${safeDimension(attributes.minHeight)};` }
            : {}
        },
        alignment: {
          default: null,
          parseHTML: element => safeAlignment(element.getAttribute('data-table-alignment')),
          renderHTML: attributes => alignmentStyle(attributes.alignment)
            ? { 'data-table-alignment': safeAlignment(attributes.alignment), style: alignmentStyle(attributes.alignment) }
            : {}
        }
      }
    }, {
      types: ['horizontalRule'],
      attributes: {
        width: {
          default: null,
          parseHTML: element => safeDimension(element.style.width),
          renderHTML: attributes => safeDimension(attributes.width) ? { style: `width: ${safeDimension(attributes.width)};` } : {}
        },
        alignment: {
          default: null,
          parseHTML: element => safeAlignment(element.getAttribute('data-hr-alignment')),
          renderHTML: attributes => alignmentStyle(attributes.alignment)
            ? { 'data-hr-alignment': safeAlignment(attributes.alignment), style: alignmentStyle(attributes.alignment) }
            : {}
        }
      }
    }, {
      types: ['youtube'],
      attributes: {
        title: { default: null },
        allowFullscreen: {
          default: true,
          parseHTML: element => element.hasAttribute('allowfullscreen'),
          renderHTML: attributes => attributes.allowFullscreen === false ? {} : { allowfullscreen: '' }
        },
        allowedPermissions: {
          default: null,
          parseHTML: element => safePermissions(element.getAttribute('allow')),
          renderHTML: attributes => safePermissions(attributes.allowedPermissions)
            ? { allow: safePermissions(attributes.allowedPermissions) }
            : {}
        },
        borderless: {
          default: false,
          parseHTML: element => element.getAttribute('frameborder') === '0' || element.style.border === '0px',
          renderHTML: attributes => attributes.borderless ? { style: 'border: 0;' } : {}
        },
        tabIndex: {
          default: null,
          parseHTML: element => element.tabIndex === 0 || element.tabIndex === -1 ? element.tabIndex : null,
          renderHTML: attributes => attributes.tabIndex === 0 || attributes.tabIndex === -1
            ? { tabindex: String(attributes.tabIndex) }
            : {}
        }
      }
    }]
  }
})
