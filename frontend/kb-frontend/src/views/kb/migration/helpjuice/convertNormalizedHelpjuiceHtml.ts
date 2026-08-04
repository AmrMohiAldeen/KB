import type { JSONContent } from '@tiptap/core'

import type { MigrationWarning, MigrationWarningCode } from './normalizeHelpjuiceHtml'

type MediaPlaceholder = {
  token: string
  node: JSONContent
}

export type HelpjuiceTocItem = {
  id: string
  level: number
  text: string
}

export type PreparedHelpjuiceHtml = {
  html: string
  placeholders: MediaPlaceholder[]
  warnings: MigrationWarning[]
}

const HELPJUICE_LINK_PATTERN = /^(?:\/_questions\/\d+(?:[/?#]|$)|https:\/\/[^/]*\.helpjuice\.com(?:\/|$))/i
const HELPJUICE_BOOKMARK_PATTERN = /^#_bmk[A-Za-z0-9_-]+$/
const SAFE_EMBED_URL = /^(?:https?:\/\/|\/)/i
const BASE64_MEDIA = /^data:/i

function migrationWarning(code: MigrationWarningCode, message: string, element?: string): MigrationWarning {
  return { code, severity: 'warning', message, ...(element ? { element } : {}) }
}

function replaceTag(element: HTMLElement, tagName: string): HTMLElement {
  if (element.tagName.toLowerCase() === tagName) return element

  const replacement = element.ownerDocument.createElement(tagName)
  Array.from(element.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value))
  while (element.firstChild) replacement.append(element.firstChild)
  element.replaceWith(replacement)

  return replacement
}

function moveChildren(from: Element, to: ParentNode): void {
  while (from.firstChild) to.append(from.firstChild)
}

function transformCallouts(root: HTMLElement): void {
  Array.from(root.querySelectorAll<HTMLElement>('.helpjuice-callout, .callout')).forEach(source => {
    if (source.closest('[data-kb-callout]')) return

    const callout = replaceTag(source, 'aside')
    const variant =
      callout.classList.contains('warning') || callout.classList.contains('callout-warning')
        ? 'warning'
        : callout.classList.contains('success')
          ? 'success'
          : 'info'
    let content = callout.querySelector<HTMLElement>(':scope > .helpjuice-callout-body')

    if (!content) {
      content = callout.ownerDocument.createElement('div')
      moveChildren(callout, content)
      callout.append(content)
    }

    callout.setAttribute('data-kb-callout', '')
    callout.setAttribute('data-kb-callout-variant', variant)
    content.setAttribute('data-kb-callout-content', '')
  })
}

function transformAccordions(root: HTMLElement): void {
  Array.from(root.querySelectorAll<HTMLElement>('.helpjuice-accordion')).forEach((source, index) => {
    if (!source.isConnected) return

    const title = source.querySelector<HTMLElement>('.helpjuice-accordion-title')
    const body = source.querySelector<HTMLElement>('.helpjuice-accordion-body')
    const accordion = source.ownerDocument.createElement('div')
    const item = source.ownerDocument.createElement('details')
    const panel = source.ownerDocument.createElement('div')

    accordion.setAttribute('data-kb-accordion', '')
    item.setAttribute('data-kb-accordion-item', '')
    item.setAttribute('data-kb-accordion-id', `accordion-${index + 1}`)
    item.setAttribute('data-kb-accordion-title', title?.textContent?.trim() || 'Section')
    panel.setAttribute('data-kb-accordion-panel', '')

    if (body) moveChildren(body, panel)
    else {
      Array.from(source.childNodes).forEach(child => {
        if (child !== title) panel.append(child)
      })
    }

    item.append(panel)
    accordion.append(item)
    source.replaceWith(accordion)
  })
}

function transformTabs(root: HTMLElement): void {
  let groupIndex = 0

  Array.from(root.querySelectorAll<HTMLElement>('.helpjuice-tab')).forEach(source => {
    if (!source.isConnected || source.closest('[data-kb-tabs]')) return

    const tabs: HTMLElement[] = [source]
    let next = source.nextElementSibling as HTMLElement | null
    while (next?.classList.contains('helpjuice-tab')) {
      tabs.push(next)
      next = next.nextElementSibling as HTMLElement | null
    }

    groupIndex += 1
    const container = source.ownerDocument.createElement('div')
    container.setAttribute('data-kb-tabs', '')

    tabs.forEach((tab, itemIndex) => {
      const title = tab.querySelector<HTMLElement>('.helpjuice-tab-title')
      const body = tab.querySelector<HTMLElement>('.helpjuice-tab-body')
      const item = tab.ownerDocument.createElement('section')
      const panel = tab.ownerDocument.createElement('div')

      item.setAttribute('data-kb-tab-item', '')
      item.setAttribute('data-kb-tab-id', `tab-${groupIndex}-${itemIndex + 1}`)
      item.setAttribute('data-kb-tab-label', title?.textContent?.trim() || `Tab ${itemIndex + 1}`)
      panel.setAttribute('data-kb-tab-panel', '')

      if (body) moveChildren(body, panel)
      else {
        Array.from(tab.childNodes).forEach(child => {
          if (child !== title) panel.append(child)
        })
      }

      item.append(panel)
      container.append(item)
    })

    source.replaceWith(container)
    tabs.slice(1).forEach(tab => tab.remove())
  })
}

function transformDecisionTrees(root: HTMLElement, warnings: MigrationWarning[]): void {
  Array.from(root.querySelectorAll<HTMLElement>('.helpjuice-decision-tree')).forEach(tree => {
    if (!tree.isConnected) return

    warnings.push(
      migrationWarning(
        'DECISION_TREE_STATIC_FALLBACK',
        'The decision tree was converted to readable static content because no compatible editor node exists.',
        '.helpjuice-decision-tree'
      )
    )

    const section = replaceTag(tree, 'section')
    const heading = section.ownerDocument.createElement('h3')
    heading.textContent = 'Decision tree'
    section.prepend(heading)

    Array.from(
      section.querySelectorAll<HTMLElement>(
        '.helpjuice-decision-tree-first-question, .helpjuice-decision-tree-button, .helpjuice-decision-tree-button-text, .helpjuice-decision-tree-tab-nav, .helpjuice-decision-tree-tab-content, .helpjuice-decision-tree-tab-content-inner, .helpjuice-decision-tree-tabs'
      )
    ).forEach(element => {
      if (!element.isConnected) return
      if (element.classList.contains('helpjuice-decision-tree-first-question')) replaceTag(element, 'h4')
      else if (element.tagName.toLowerCase() === 'button') replaceTag(element, 'p')
    })
  })
}

function transformGlossary(root: HTMLElement): void {
  Array.from(root.querySelectorAll<HTMLElement>('.hj-glossary-item')).forEach(item => {
    const term = item.textContent?.trim() ?? ''
    const definition = item.getAttribute('data-definition')?.trim() ?? ''
    if (!term || !definition) return

    const glossary = replaceTag(item, 'span')
    glossary.setAttribute('data-kb-glossary', '')
    glossary.setAttribute('data-kb-glossary-term', term)
    glossary.setAttribute('data-kb-glossary-definition', definition)
    const id = glossary.getAttribute('data-id')
    if (id) glossary.setAttribute('data-kb-glossary-id', id)
  })

  Array.from(
    root.querySelectorAll('.glossary-article input, .glossary-terms input, input.glossary-search, .alphabetical-navigation')
  ).forEach(element => element.remove())
  Array.from(root.querySelectorAll<HTMLElement>('.glossary-article-header')).forEach(header => replaceTag(header, 'h2'))
}

function transformTaskLists(root: HTMLElement): void {
  Array.from(root.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')).forEach(checkbox => {
    const item = checkbox.closest('li')
    const list = item?.parentElement
    if (!item || list?.tagName.toLowerCase() !== 'ul') return

    list.setAttribute('data-type', 'taskList')
    item.setAttribute('data-type', 'taskItem')
    item.setAttribute('data-checked', checkbox.checked ? 'true' : 'false')
    checkbox.remove()
  })
}

function flattenLayoutTables(root: HTMLElement, warnings: MigrationWarning[]): void {
  Array.from(root.querySelectorAll<HTMLTableElement>('table')).forEach(table => {
    const cells = Array.from(table.querySelectorAll<HTMLElement>('th, td'))
    const images = table.querySelectorAll('img').length
    const blankCells = cells.filter(cell => !cell.textContent?.trim() && !cell.querySelector('img')).length
    const isLayoutTable = images > 0 && cells.length > 0 && blankCells / cells.length >= 0.5

    if (!isLayoutTable) {
      if (table.style.border || table.querySelector('[style*="border"]')) {
        ;['top', 'right', 'bottom', 'left', 'inner'].forEach(side =>
          table.setAttribute(`data-table-border-${side}`, 'true')
        )
      }
      return
    }

    const fragment = table.ownerDocument.createDocumentFragment()
    cells.forEach(cell => moveChildren(cell, fragment))
    table.replaceWith(fragment)
    warnings.push(
      migrationWarning('LAYOUT_TABLE_FLATTENED', 'A screenshot-oriented layout table was flattened into sequential content blocks.', 'table')
    )
  })
}

function slugHeading(text: string, index: number): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)

  return slug && /^[a-z]/.test(slug) ? slug : `heading-${index + 1}`
}

function transformHeadings(root: HTMLElement, warnings: MigrationWarning[]): void {
  const referencedIds = new Set(
    Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
      .map(anchor => anchor.getAttribute('href')?.slice(1) ?? '')
      .filter(id => id && !HELPJUICE_BOOKMARK_PATTERN.test(`#${id}`))
  )
  const used = new Set<string>()
  const rewrittenDestinations = new Map<string, string>()

  Array.from(root.querySelectorAll<HTMLElement>('h5')).forEach(heading => {
    replaceTag(heading, 'h4')
    warnings.push(migrationWarning('H5_MAPPED_TO_H4', 'An H5 heading was mapped to H4 for editor compatibility.', 'h5'))
  })

  Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).forEach((heading, index) => {
    const oldId = heading.getAttribute('id')?.trim() ?? ''
    const canRetainOldId = referencedIds.has(oldId) && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(oldId)
    const base = canRetainOldId ? oldId : slugHeading(heading.textContent?.trim() ?? '', index)
    let id = base
    let suffix = 2
    while (used.has(id)) id = `${base}-${suffix++}`
    if (id !== base) {
      warnings.push(migrationWarning('DUPLICATE_HEADING_ID', `Duplicate heading id "${base}" was replaced with "${id}".`, 'heading'))
    }
    used.add(id)
    heading.setAttribute('id', id)
    if (oldId && !rewrittenDestinations.has(oldId)) rewrittenDestinations.set(oldId, id)
  })

  Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).forEach(anchor => {
    const href = anchor.getAttribute('href') ?? ''
    if (HELPJUICE_BOOKMARK_PATTERN.test(href)) {
      // Preserve unresolved source bookmarks for backend mapping and manual review.
      warnings.push(migrationWarning('UNRESOLVED_BOOKMARK_LINK', 'The Helpjuice bookmark link was retained because its destination is unknown.', 'a'))
      return
    }

    const destination = rewrittenDestinations.get(href.slice(1))
    if (destination) anchor.setAttribute('href', `#${destination}`)
  })
}

function annotateLinks(root: HTMLElement, warnings: MigrationWarning[]): void {
  Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).forEach(anchor => {
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (HELPJUICE_LINK_PATTERN.test(href)) {
      // The backend migration mapping rewrites source article links after destination identities are known.
      warnings.push(migrationWarning('UNRESOLVED_INTERNAL_LINK', 'The Helpjuice internal link was retained until article mappings are available.', 'a'))
    }

    if (/^https?:\/\//i.test(href) && anchor.target.toLowerCase() === '_blank') {
      anchor.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

function readDimension(element: HTMLElement, name: 'width' | 'height'): number | null {
  const raw = element.getAttribute(name) ?? element.style.getPropertyValue(name)
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i)
  if (!match) return null
  const value = Math.round(Number(match[1]))

  return Number.isFinite(value) && value > 0 ? value : null
}

function createPlaceholder(document: Document, token: string): HTMLParagraphElement {
  const paragraph = document.createElement('p')
  paragraph.textContent = token
  return paragraph
}

function addImagePlaceholder(
  image: HTMLImageElement,
  wrapper: HTMLElement,
  caption: string | null,
  placeholders: MediaPlaceholder[],
  warnings: MigrationWarning[]
): void {
  const src = image.getAttribute('src')?.trim() ?? ''
  if (!src || BASE64_MEDIA.test(src)) {
    const replacement = caption ? image.ownerDocument.createElement('p') : null
    if (replacement) replacement.textContent = caption
    wrapper.replaceWith(...(replacement ? [replacement] : []))
    warnings.push(migrationWarning('BROKEN_IMAGE', 'An image without a usable non-Base64 source was omitted.', 'img'))
    return
  }

  if (/^https?:\/\//i.test(src)) {
    // The backend media phase resolves this preview placeholder to a stored media ID and URL.
    warnings.push(migrationWarning('MEDIA_REQUIRES_MIGRATION', 'The external image source is retained temporarily until media migration is available.', 'img'))
  }

  const token = `HJ_MEDIA_${placeholders.length + 1}`
  const classes = new Set([...Array.from(wrapper.classList), ...Array.from(image.classList)])
  const imageOffsetPct = classes.has('image-style-side') ? 100 : classes.has('image-style-align-left') ? 0 : null
  const width = readDimension(image, 'width') ?? readDimension(wrapper, 'width')
  const height = readDimension(image, 'height')

  placeholders.push({
    token,
    node: {
      type: 'image',
      attrs: {
        src,
        alt: image.hasAttribute('alt') ? image.getAttribute('alt') : null,
        title: caption,
        width,
        height,
        imageOffsetPct
      }
    }
  })
  wrapper.replaceWith(createPlaceholder(image.ownerDocument, token))
}

function transformImages(root: HTMLElement, placeholders: MediaPlaceholder[], warnings: MigrationWarning[]): void {
  const handled = new Set<HTMLImageElement>()

  Array.from(root.querySelectorAll<HTMLElement>('figure')).forEach(figure => {
    const image = figure.querySelector<HTMLImageElement>('img')
    if (!image) return
    handled.add(image)
    const caption = figure.querySelector('figcaption')?.textContent?.trim() || null
    addImagePlaceholder(image, figure, caption, placeholders, warnings)
  })

  Array.from(root.querySelectorAll<HTMLImageElement>('img')).forEach(image => {
    if (handled.has(image) || !image.isConnected) return
    addImagePlaceholder(image, image, null, placeholders, warnings)
  })
}

function isYoutubeUrl(src: string): boolean {
  return /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?)|youtu\.be\/)/i.test(src)
}

function replaceEmbedWithLink(element: HTMLElement, src: string, label: string): void {
  const paragraph = element.ownerDocument.createElement('p')
  const link = element.ownerDocument.createElement('a')
  link.href = src
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = label
  paragraph.append(link)
  element.replaceWith(paragraph)
}

function transformEmbeds(root: HTMLElement, placeholders: MediaPlaceholder[], warnings: MigrationWarning[]): void {
  Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe')).forEach(iframe => {
    const src = iframe.getAttribute('src')?.trim() ?? ''
    if (!SAFE_EMBED_URL.test(src)) {
      iframe.remove()
      warnings.push(migrationWarning('UNSUPPORTED_EMBED', 'An unsafe or empty embed was removed.', 'iframe'))
      return
    }

    if (isYoutubeUrl(src)) {
      const token = `HJ_MEDIA_${placeholders.length + 1}`
      placeholders.push({
        token,
        node: {
          type: 'youtube',
          attrs: {
            src,
            start: 0,
            width: readDimension(iframe, 'width') ?? 640,
            height: readDimension(iframe, 'height') ?? 480
          }
        }
      })
      iframe.replaceWith(createPlaceholder(iframe.ownerDocument, token))
      return
    }

    // The backend media phase resolves compatible embed sources.
    const label = /\.pdf(?:[?#]|$)/i.test(src)
      ? 'Open PDF attachment'
      : /wizardshot/i.test(src)
        ? 'Open Wizardshot embed'
        : 'Open embedded content'
    replaceEmbedWithLink(iframe, src, label)
    warnings.push(migrationWarning('UNSUPPORTED_EMBED', 'An embed without a compatible editor node was converted to a link.', 'iframe'))
  })

  Array.from(root.querySelectorAll<HTMLVideoElement>('video')).forEach(video => {
    const src = video.getAttribute('src')?.trim() || video.querySelector('source')?.getAttribute('src')?.trim() || ''
    if (!SAFE_EMBED_URL.test(src)) {
      video.remove()
      warnings.push(migrationWarning('UNSUPPORTED_EMBED', 'A video without a safe source was removed.', 'video'))
      return
    }

    // The backend media phase resolves compatible hosted-video sources.
    replaceEmbedWithLink(video, src, 'Open video')
    warnings.push(migrationWarning('UNSUPPORTED_EMBED', 'A hosted video was converted to a link because no compatible hosted-video node exists.', 'video'))
  })
}

export function prepareHelpjuiceSemanticHtml(html: string): PreparedHelpjuiceHtml {
  const warnings: MigrationWarning[] = []
  const placeholders: MediaPlaceholder[] = []
  if (typeof DOMParser === 'undefined') return { html, placeholders, warnings }

  const document = new DOMParser().parseFromString(html, 'text/html')
  const root = document.body

  transformCallouts(root)
  transformAccordions(root)
  transformTabs(root)
  transformDecisionTrees(root, warnings)
  transformTaskLists(root)
  transformGlossary(root)
  flattenLayoutTables(root, warnings)
  transformHeadings(root, warnings)
  annotateLinks(root, warnings)
  transformImages(root, placeholders, warnings)
  transformEmbeds(root, placeholders, warnings)

  return { html: root.innerHTML, placeholders, warnings }
}

function isPlaceholderParagraph(node: JSONContent, token: string): boolean {
  return (
    node.type === 'paragraph' &&
    node.content?.length === 1 &&
    node.content[0].type === 'text' &&
    node.content[0].text === token
  )
}

export function replaceHelpjuiceMediaPlaceholders(json: JSONContent, placeholders: MediaPlaceholder[]): JSONContent {
  const byToken = new Map(placeholders.map(item => [item.token, item.node]))

  const replaceNode = (node: JSONContent): JSONContent => {
    for (const [token, replacement] of byToken) {
      if (isPlaceholderParagraph(node, token)) return replacement
    }

    return node.content ? { ...node, content: node.content.map(replaceNode) } : node
  }

  return replaceNode(json)
}

export function buildHelpjuiceToc(json: JSONContent): HelpjuiceTocItem[] {
  const items: HelpjuiceTocItem[] = []

  const visit = (node: JSONContent) => {
    if (node.type === 'heading') {
      const id = typeof node.attrs?.id === 'string' ? node.attrs.id : ''
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      const text = node.content?.map(child => child.text ?? '').join('').trim() ?? ''
      if (id && text) items.push({ id, level, text })
    }
    node.content?.forEach(visit)
  }

  visit(json)
  return items
}
