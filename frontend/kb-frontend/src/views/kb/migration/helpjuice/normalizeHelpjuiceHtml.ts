export type MigrationWarningCode =
  | 'MALFORMED_HTML_REPAIRED'
  | 'BASE64_MEDIA_FOUND'
  | 'MEDIA_REQUIRES_MIGRATION'
  | 'BROKEN_IMAGE'
  | 'UNRESOLVED_INTERNAL_LINK'
  | 'UNRESOLVED_BOOKMARK_LINK'
  | 'DUPLICATE_HEADING_ID'
  | 'H5_MAPPED_TO_H4'
  | 'LAYOUT_TABLE_FLATTENED'
  | 'UNSUPPORTED_EMBED'
  | 'DECISION_TREE_STATIC_FALLBACK'
  | 'TRANSLATION_PLACEHOLDER'
  | 'EMPTY_ANSWER'
  | 'TEXT_CONTENT_MISMATCH'
  | 'TIPTAP_SCHEMA_VALIDATION_FAILED'
  | 'UNSUPPORTED_TEXT_COLOR'
  | 'UNSUPPORTED_TABLE_WIDTH'
  | 'UNSUPPORTED_TABLE_COLUMN_WIDTH'

export type MigrationWarning = {
  code: MigrationWarningCode
  severity: 'info' | 'warning' | 'error'
  message: string
  element?: string
}

/**
 * Helpjuice classes are deliberately kept in one registry. Some of them are
 * migration semantics, while others are known source/editor implementation
 * details that can be removed safely.
 */
export const HELPJUICE_CLASS_REGISTRY = {
  preserve: new Set([
    'helpjuice-callout',
    'helpjuice-callout-body',
    'helpjuice-callout-delete',
    'info',
    'success',
    'warning',
    'callout',
    'callout-info',
    'callout-warning',
    'helpjuice-accordion',
    'helpjuice-accordion-title',
    'helpjuice-accordion-body',
    'helpjuice-accordion-toggle',
    'helpjuice-accordion-delete',
    'helpjuice-tab',
    'helpjuice-tab-title',
    'helpjuice-tab-body',
    'helpjuice-tab-toggle',
    'helpjuice-tab-delete',
    'helpjuice-decision-tree',
    'helpjuice-decision-tree-add-answers',
    'helpjuice-decision-tree-add-tab-button',
    'helpjuice-decision-tree-button',
    'helpjuice-decision-tree-button-text',
    'helpjuice-decision-tree-delete',
    'helpjuice-decision-tree-delete-button',
    'helpjuice-decision-tree-first-question',
    'helpjuice-decision-tree-tab-content',
    'helpjuice-decision-tree-tab-content-inner',
    'helpjuice-decision-tree-tab-nav',
    'helpjuice-decision-tree-tabs',
    'hj-glossary-item',
    'glossary-article',
    'glossary-article-header',
    'glossary-locked-article',
    'glossary-terms',
    'alphabetical-navigation',
    'image',
    'image_resized',
    'image-style-side',
    'image-style-align-left',
    'table',
    'ck-table-resized',
    'video-wrapper',
    'video-player',
    'video-player-pre',
    'video',
    'ws-iframe-actions',
    'translation-placeholder-locked',
    'helpjuice-thread',
    'article-body'
  ]),
  stripExact: new Set([
    'MsoBodyText',
    'MsoCommentText',
    'MsoListParagraph',
    'MsoListParagraphCxSpFirst',
    'MsoListParagraphCxSpLast',
    'MsoListParagraphCxSpMiddle',
    'MsoNormal',
    'MsoTableGrid',
    'msocomtxt',
    'WordSection1',
    'BCX0',
    'BCX8',
    'BlobObject',
    'DragDrop',
    'EOP',
    'eop',
    'NoPadding',
    'NormalTextRun',
    'normaltextrun',
    'OutlineElement',
    'TextRun',
    'WACImage',
    'WACImageContainer',
    'fui-Chat',
    'fui-ChatMessage__body',
    'fui-ChatMyMessage',
    'fui-ChatMyMessage__body',
    'fui-Flex',
    'fui-Image',
    'fui-Primitive',
    'fui-unstable-ChatItem',
    'ui-provider',
    '_tableContainer_1rjym_1',
    '_tableWrapper_1rjym_13',
    'TyagGW_tableContainer',
    'TyagGW_tableWrapper'
  ]),
  stripPatterns: [/^SCXW\d+$/, /^ps\d+$/, /^ts\d+$/, /^___[A-Za-z0-9_-]+$/, /^f\d[A-Za-z0-9_-]+$/, /^r\d[A-Za-z0-9_-]+$/],
  unwrap: new Set(['article-body', 'helpjuice-thread', 'video-wrapper', 'video-player', 'video-player-pre', 'table']),
  removeControls: new Set([
    'helpjuice-callout-delete',
    'helpjuice-accordion-toggle',
    'helpjuice-accordion-delete',
    'helpjuice-tab-toggle',
    'helpjuice-tab-delete',
    'helpjuice-decision-tree-add-answers',
    'helpjuice-decision-tree-add-tab-button',
    'helpjuice-decision-tree-delete',
    'helpjuice-decision-tree-delete-button',
    'ws-iframe-actions',
    'alphabetical-navigation'
  ])
} as const

const STRIPPED_ATTRIBUTE_PATTERNS = [
  /^data-mce-/i,
  /^data-ccp-/i,
  /^data-editor--/i,
  /^data-teams$/i,
  /^data-controller$/i,
  /^para(?:id|eid)$/i,
  /^uploadprocessed$/i,
  /^data-toc$/i
]

const SUPPORTED_STYLE_PROPERTIES = new Set([
  'font-family',
  'font-size',
  'color',
  'background-color',
  'text-align',
  'direction',
  'list-style-type',
  'width',
  'height',
  'vertical-align',
  'border',
  'border-color',
  'border-style',
  'border-width'
])

const FONT_ALIASES = new Map<string, string>([
  ['arial', 'Arial'],
  ['arialmt', 'Arial'],
  ['helvetica', 'Helvetica'],
  ['helvetica neue', 'Helvetica'],
  ['segoe ui', 'Segoe UI'],
  ['segoeui', 'Segoe UI'],
  ['segoe ui variable', 'Segoe UI'],
  ['times new roman', 'Times New Roman'],
  ['times', 'Times New Roman'],
  ['timesnewromanpsmt', 'Times New Roman'],
  ['georgia', 'Georgia'],
  ['courier new', 'Courier New'],
  ['courier', 'Courier New'],
  ['couriernewpsmt', 'Courier New'],
  ['consolas', 'Consolas'],
  ['monaco', 'Monaco'],
  ['inter', 'Inter'],
  ['var(--font-inter)', 'Inter'],
  ['roboto', 'Roboto'],
  ['var(--font-roboto)', 'Roboto'],
  ['eb garamond', 'EB Garamond'],
  ['var(--font-eb-garamond)', 'EB Garamond'],
  ['tahoma', 'Tahoma'],
  ['calibri', 'Calibri'],
  ['calibri light', 'Calibri'],
  ['aptos', 'Aptos'],
  ['aptos body', 'Aptos'],
  ['aptos display', 'Aptos'],
  ['open sans', 'Open Sans']
])

const EMPTY_BLOCK_SELECTOR = 'p, div, section, article, blockquote, h1, h2, h3, h4, h5, h6'
const BASE64_URL_PATTERN = /^data:[^;,]+(?:;[^,]*)?;base64,/i

function warning(code: MigrationWarningCode, severity: MigrationWarning['severity'], message: string, element?: string): MigrationWarning {
  return { code, severity, message, ...(element ? { element } : {}) }
}

function repairMalformedFontFamily(html: string): { html: string; repaired: boolean } {
  let repaired = false
  const normalized = html.replace(
    /style=(['"])\s*font-family:\s*\1\s*(arial|times\s+new\s+roman)(?=\s|>)/gi,
    (_match, quote: string, family: string) => {
      repaired = true
      return `style=${quote}font-family: ${family}${quote}`
    }
  )

  return { html: normalized, repaired }
}

function unwrap(element: Element): void {
  element.replaceWith(...Array.from(element.childNodes))
}

function hasAnyClass(element: Element, classes: ReadonlySet<string>): boolean {
  return Array.from(element.classList).some(className => classes.has(className))
}

function normalizeFontFamily(value: string): string | null {
  for (const candidate of value.split(',')) {
    const token = candidate.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, ' ').toLowerCase()
    const normalized = FONT_ALIASES.get(token)
    if (normalized) return normalized.includes(' ') ? `"${normalized}"` : normalized
  }

  return null
}

function normalizeStyle(element: HTMLElement): void {
  const declarations: string[] = []

  for (const property of Array.from(element.style)) {
    const normalizedProperty = property.toLowerCase()
    if (!SUPPORTED_STYLE_PROPERTIES.has(normalizedProperty)) continue

    let value = element.style.getPropertyValue(property).trim()
    if (!value || /(?:expression\s*\(|javascript\s*:|vbscript\s*:|@import)/i.test(value)) continue

    if (normalizedProperty === 'font-family') {
      const family = normalizeFontFamily(value)
      if (!family) continue
      value = family
    }

    if (normalizedProperty === 'direction') {
      value = value.toLowerCase()
      if (value !== 'rtl' && value !== 'ltr') continue
      if (!element.hasAttribute('dir')) element.setAttribute('dir', value)
    }

    if (normalizedProperty === 'width' && ['table', 'col', 'td', 'th'].includes(element.tagName.toLowerCase())) {
      value = normalizeCssDimension(value) ?? value
    }

    declarations.push(`${normalizedProperty}: ${value}`)
  }

  if (declarations.length > 0) element.setAttribute('style', declarations.join('; '))
  else element.removeAttribute('style')
}

function normalizeCssDimension(value: string): string | null {
  const match = value.trim().replace(/\s*!important\s*$/i, '').match(/^(\d+(?:\.\d+)?)(%|px|in|cm|mm|pt|pc|em|rem)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  const unit = (match[2] ?? 'px').toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (unit === '%') return `${amount}%`
  const factors: Record<string, number> = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, em: 16, rem: 16 }
  const pixels = amount * factors[unit]
  return Number.isFinite(pixels) ? `${Number(pixels.toFixed(3))}px` : null
}

function validDimension(value: string, kind: 'table' | 'column'): boolean {
  const match = normalizeCssDimension(value)?.match(/^(\d+(?:\.\d+)?)(%|px)$/i)
  if (!match) return false
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return false
  if (match[2] === '%') return amount >= (kind === 'table' ? 10 : 2.5) && amount <= 100
  return amount >= 25 && amount <= (kind === 'table' ? 4000 : 2000)
}

function diagnoseFormatting(element: HTMLElement, warnings: MigrationWarning[]): void {
  const rawStyle = element.getAttribute('style') ?? ''
  let rawWidth = ''
  rawStyle.split(';').forEach(declaration => {
    const separator = declaration.indexOf(':')
    if (separator <= 0) return
    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim().replace(/\s*!important\s*$/i, '')
    if (property === 'width') rawWidth = value
    if (property === 'color' && value) {
      const probe = element.ownerDocument.createElement('span')
      probe.style.color = value
      if (!probe.style.color || /(?:expression\s*\(|javascript\s*:|vbscript\s*:|var\s*\(|url\s*\()/i.test(value)) {
        warnings.push(warning('UNSUPPORTED_TEXT_COLOR', 'warning', `Unsupported text color "${value}" was omitted.`, element.tagName.toLowerCase()))
      }
    }
  })

  const tag = element.tagName.toLowerCase()
  if (tag === 'table') {
    const width = rawWidth || element.getAttribute('width') || ''
    if (width && !validDimension(width, 'table')) {
      warnings.push(warning('UNSUPPORTED_TABLE_WIDTH', 'warning', `Unsupported table width "${width}" was omitted.`, 'table'))
    }
  } else if (tag === 'col' || tag === 'td' || tag === 'th') {
    const width = rawWidth || element.getAttribute('width') || ''
    if (width && !validDimension(width, 'column')) {
      warnings.push(warning('UNSUPPORTED_TABLE_COLUMN_WIDTH', 'warning', `Unsupported table column width "${width}" was omitted.`, tag))
    }
  }
}

function normalizeImageSource(element: HTMLElement, warnings: MigrationWarning[]): void {
  if (element.tagName.toLowerCase() !== 'img' && element.tagName.toLowerCase() !== 'v:imagedata') return

  const src = element.getAttribute('src')?.trim() ?? ''
  const mceSrc = element.getAttribute('data-mce-src')?.trim() ?? ''
  const normalSrc =
    src && !BASE64_URL_PATTERN.test(src) ? src : mceSrc && !BASE64_URL_PATTERN.test(mceSrc) ? mceSrc : ''
  const base64Src = BASE64_URL_PATTERN.test(src) ? src : BASE64_URL_PATTERN.test(mceSrc) ? mceSrc : ''

  if (normalSrc) {
    element.setAttribute('src', normalSrc)
    return
  }

  if (base64Src) {
    // Base64 media is deliberately excluded from preview and reported for authoritative backend handling.
    element.setAttribute('src', base64Src)
    warnings.push(warning('BASE64_MEDIA_FOUND', 'warning', 'Base64 media must be uploaded during media migration.', 'img'))
  }
}

function normalizeOfficeWrappers(root: HTMLElement, warnings: MigrationWarning[]): void {
  Array.from(root.querySelectorAll<HTMLElement>('*'))
    .reverse()
    .forEach(element => {
      const tagName = element.tagName.toLowerCase()
      if (!['o:p', 'v:shape', 'v:imagedata', 'v:path', 'o:lock'].includes(tagName)) return

      if (tagName === 'v:imagedata') {
        normalizeImageSource(element, warnings)
        const src = element.getAttribute('src')
        if (src) {
          const image = element.ownerDocument.createElement('img')
          image.setAttribute('src', src)
          const alt = element.getAttribute('alt') ?? element.getAttribute('o:title')
          if (alt) image.setAttribute('alt', alt)
          element.replaceWith(image)
          return
        }
      }

      unwrap(element)
    })
}

function isEmptyBlock(element: Element): boolean {
  return !element.textContent?.replace(/\u00a0/g, ' ').trim() && !element.querySelector('img, video, iframe, table, hr')
}

function normalizeWhitespace(root: HTMLElement): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text)

  textNodes.forEach(textNode => {
    if (textNode.parentElement?.closest('pre, code')) return
    textNode.data = textNode.data.replace(/\u00a0/g, ' ')
  })

  let previousBlankParagraph = false
  Array.from(root.querySelectorAll('p')).forEach(paragraph => {
    const blank = isEmptyBlock(paragraph)
    if (blank && previousBlankParagraph) paragraph.remove()
    previousBlankParagraph = blank
    if (!blank) previousBlankParagraph = false
  })

  Array.from(root.querySelectorAll('br')).forEach(br => {
    const previous = br.previousElementSibling
    const previousPrevious = previous?.previousElementSibling
    if (previous?.tagName === 'BR' && previousPrevious?.tagName === 'BR') br.remove()
  })

  const trimBoundary = (fromStart: boolean) => {
    while (true) {
      const child = fromStart ? root.firstElementChild : root.lastElementChild
      if (!child?.matches(EMPTY_BLOCK_SELECTOR) || !isEmptyBlock(child)) return
      child.remove()
    }
  }

  trimBoundary(true)
  trimBoundary(false)
}

export function normalizeHelpjuiceHtml(html: string): { html: string; warnings: MigrationWarning[] } {
  const warnings: MigrationWarning[] = []
  const repaired = repairMalformedFontFamily(html.replace(/^\uFEFF/, ''))

  if (repaired.repaired) {
    warnings.push(warning('MALFORMED_HTML_REPAIRED', 'info', 'Malformed font-family markup was repaired before parsing.'))
  }

  if (typeof DOMParser === 'undefined') return { html: repaired.html.trim(), warnings }

  const document = new DOMParser().parseFromString(repaired.html, 'text/html')
  const root = document.body

  if (root.querySelector('.translation-placeholder-locked')) {
    warnings.push(
      warning(
        'TRANSLATION_PLACEHOLDER',
        'error',
        'A locked translation placeholder requires manual review before migration.',
        '.translation-placeholder-locked'
      )
    )
  }

  Array.from(root.querySelectorAll<HTMLElement>('*')).forEach(element => {
    if (hasAnyClass(element, HELPJUICE_CLASS_REGISTRY.removeControls)) element.remove()
  })

  normalizeOfficeWrappers(root, warnings)

  Array.from(root.querySelectorAll<HTMLElement>('*')).forEach(element => {
    diagnoseFormatting(element, warnings)
    normalizeImageSource(element, warnings)

    Array.from(element.attributes).forEach(attribute => {
      if (STRIPPED_ATTRIBUTE_PATTERNS.some(pattern => pattern.test(attribute.name))) {
        element.removeAttribute(attribute.name)
      }
    })

    const retainedClasses = Array.from(element.classList).filter(
      className =>
        HELPJUICE_CLASS_REGISTRY.preserve.has(className) ||
        (!HELPJUICE_CLASS_REGISTRY.stripExact.has(className) &&
          !HELPJUICE_CLASS_REGISTRY.stripPatterns.some(pattern => pattern.test(className)))
    )

    if (retainedClasses.length > 0) element.setAttribute('class', retainedClasses.join(' '))
    else element.removeAttribute('class')

    normalizeStyle(element)
  })

  Array.from(root.querySelectorAll<HTMLElement>('*'))
    .reverse()
    .forEach(element => {
      const isSemanticTable = element.tagName.toLowerCase() === 'table' && element.classList.contains('table')
      if (hasAnyClass(element, HELPJUICE_CLASS_REGISTRY.unwrap) && !isSemanticTable) unwrap(element)
    })

  normalizeWhitespace(root)

  return { html: root.innerHTML.trim(), warnings }
}
