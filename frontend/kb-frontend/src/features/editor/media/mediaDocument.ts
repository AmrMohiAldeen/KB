import type { JSONContent } from '@tiptap/core'
import {
  ATTACHMENT_NODE_NAME,
  MEDIA_UPLOAD_NODE_NAME,
  VIDEO_NODE_NAME
} from './mediaTypes'
import {
  BLOCK_IMAGE_NODE_NAME,
  INLINE_IMAGE_NODE_NAME
} from '../blocks/image/imageTypes'

const PERSISTENT_MEDIA_NODE_NAMES = new Set([
  BLOCK_IMAGE_NODE_NAME,
  INLINE_IMAGE_NODE_NAME,
  VIDEO_NODE_NAME,
  ATTACHMENT_NODE_NAME
])

const isTemporaryUrl = (value: unknown): boolean =>
  typeof value === 'string' && /^(?:blob:|data:)/i.test(value.trim())

export function sanitizeDraftMediaContent(content: JSONContent): JSONContent {
  const sanitizeNode = (node: JSONContent): JSONContent | null => {
    if (node.type === MEDIA_UPLOAD_NODE_NAME) return null
    if (PERSISTENT_MEDIA_NODE_NAMES.has(node.type ?? '') && isTemporaryUrl(node.attrs?.src)) {
      return null
    }

    const children = node.content
      ?.map(sanitizeNode)
      .filter((child): child is JSONContent => child !== null)

    return children
      ? { ...node, content: children }
      : { ...node }
  }

  return sanitizeNode(content) ?? { type: 'doc', content: [] }
}

export function extractMediaIds(content: JSONContent): string[] {
  const ids = new Set<string>()

  const visit = (node: JSONContent) => {
    if (PERSISTENT_MEDIA_NODE_NAMES.has(node.type ?? '')) {
      const mediaId = node.attrs?.mediaId
      if (typeof mediaId === 'string' && mediaId.trim()) ids.add(mediaId.trim())
    }
    node.content?.forEach(visit)
  }

  visit(content)
  return [...ids].sort()
}

export function sanitizeDraftMediaHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('[data-kb-media-upload]').forEach(node => node.remove())
  document.querySelectorAll<HTMLElement>('[src]').forEach(node => {
    if (isTemporaryUrl(node.getAttribute('src'))) node.remove()
  })
  return document.body.innerHTML
}
