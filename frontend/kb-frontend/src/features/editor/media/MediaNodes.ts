import {
  Node,
  mergeAttributes,
  type NodeViewRendererProps
} from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import type { NodeView } from '@tiptap/pm/view'
import {
  ATTACHMENT_NODE_NAME,
  DOCUMENT_EMBED_NODE_NAME,
  EXTERNAL_EMBED_NODE_NAME,
  MEDIA_UPLOAD_NODE_NAME,
  VIDEO_NODE_NAME,
  type EditorMediaUploadController
} from './mediaTypes'

type MediaNodeOptions = {
  HTMLAttributes: Record<string, unknown>
}

function persistentMediaAttributes() {
  return {
    mediaId: { default: null },
    src: { default: null },
    mimeType: { default: null },
    fileName: { default: null },
    fileSize: { default: null },
    width: { default: null },
    height: { default: null },
    minwidth: { default: null },
    maxwidth: { default: null },
    minheight: { default: null },
    maxheight: { default: null },
    alignment: { default: null },
    legacyStyle: { default: null }
  }
}

function safeDimension(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^(?:auto|0|\d+(?:\.\d+)?(?:%|px|pt|in|cm|mm|em|rem))$/.test(normalized)
    ? normalized
    : null
}

function mediaStyle(attributes: Record<string, unknown>): string {
  const dimensions = [
    ['width', 'width'], ['height', 'height'], ['minwidth', 'min-width'],
    ['maxwidth', 'max-width'], ['minheight', 'min-height'], ['maxheight', 'max-height']
  ] as const
  const dimensionStyle = dimensions
    .map(([attribute, property]) => {
      const value = safeDimension(attributes[attribute])
      return value ? `${property}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
  const alignment = String(attributes.alignment ?? '').toLowerCase()
  const alignmentStyle = alignment === 'center'
    ? 'display: block; margin-left: auto; margin-right: auto'
    : alignment === 'right'
      ? 'display: block; margin-left: auto'
      : alignment === 'left'
        ? 'display: block; margin-right: auto'
        : ''
  return [dimensionStyle, alignmentStyle].filter(Boolean).join('; ')
}

function isSafeHttpsUrl(value: unknown): boolean {
  try { return new URL(String(value)).protocol === 'https:' } catch { return false }
}

function isWizardshotEmbed(value: unknown): boolean {
  if (!isSafeHttpsUrl(value)) return false
  const url = new URL(String(value))
  return url.hostname.toLowerCase() === 'www.wizardshot.com' && /^\/embed\/tutorials\/\d+\/?$/.test(url.pathname)
}

export const VideoNode = Node.create<MediaNodeOptions>({
  name: VIDEO_NODE_NAME,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      ...persistentMediaAttributes(),
      title: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'video[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        controls: 'true',
        preload: 'metadata',
        'data-media-id': HTMLAttributes.mediaId,
        'data-kb-video': 'true',
        style: mediaStyle(HTMLAttributes)
      })
    ] satisfies DOMOutputSpec
  }
})

export const DocumentEmbedNode = Node.create<MediaNodeOptions>({
  name: DOCUMENT_EMBED_NODE_NAME,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() { return { HTMLAttributes: {} } },
  addAttributes() { return { ...persistentMediaAttributes(), title: { default: null } } },
  parseHTML() {
    return [{ tag: '[data-kb-document-embed]', getAttrs: element => {
      const source = element instanceof HTMLElement
        ? element.getAttribute('data-src') ?? element.querySelector('a')?.getAttribute('href')
        : null
      return isSafeHttpsUrl(source) && /\.pdf(?:[?#]|$)/i.test(String(source)) ? { src: source } : false
    }}]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, {
      'data-kb-document-embed': 'true',
      'data-src': HTMLAttributes.src,
      style: mediaStyle(HTMLAttributes)
    }), ['a', { href: HTMLAttributes.src, target: '_blank', rel: 'noopener noreferrer' },
      String(HTMLAttributes.title || 'Open PDF document')]] satisfies DOMOutputSpec
  }
})

export const ExternalEmbedNode = Node.create<MediaNodeOptions>({
  name: EXTERNAL_EMBED_NODE_NAME,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() { return { HTMLAttributes: {} } },
  addAttributes() { return { ...persistentMediaAttributes(), title: { default: null } } },
  parseHTML() {
    return [{ tag: 'iframe[data-kb-external-embed]', getAttrs: element => {
      const source = element instanceof HTMLElement ? element.getAttribute('src') : null
      return isWizardshotEmbed(source) ? { src: source, title: element.getAttribute('title') } : false
    }}]
  },
  renderHTML({ HTMLAttributes }) {
    if (!isWizardshotEmbed(HTMLAttributes.src))
      return ['p', {}, 'Unsupported external embed'] satisfies DOMOutputSpec
    return ['iframe', mergeAttributes(this.options.HTMLAttributes, {
      src: HTMLAttributes.src,
      title: HTMLAttributes.title || 'Embedded tutorial',
      'data-kb-external-embed': 'true',
      sandbox: 'allow-scripts allow-forms allow-popups',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
      allow: 'fullscreen',
      style: mediaStyle(HTMLAttributes)
    })] satisfies DOMOutputSpec
  }
})

export const AttachmentNode = Node.create<MediaNodeOptions>({
  name: ATTACHMENT_NODE_NAME,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return persistentMediaAttributes()
  },

  parseHTML() {
    return [{ tag: 'a[data-kb-attachment][data-media-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, {
        href: HTMLAttributes.src,
        'data-kb-attachment': 'true',
        'data-media-id': HTMLAttributes.mediaId,
        'data-mime-type': HTMLAttributes.mimeType,
        'data-file-size': HTMLAttributes.fileSize,
        download: HTMLAttributes.fileName
      }),
      String(HTMLAttributes.fileName || 'Download attachment')
    ] satisfies DOMOutputSpec
  }
})

function createUploadNodeView(
  editor: NodeViewRendererProps['editor'],
  node: NodeViewRendererProps['node']
): NodeView {
  const dom = document.createElement('div')
  const details = document.createElement('div')
  const title = document.createElement('strong')
  const message = document.createElement('span')
  const actions = document.createElement('div')
  const retry = document.createElement('button')
  const remove = document.createElement('button')

  dom.className = 'kb-media-upload'
  dom.contentEditable = 'false'
  dom.dataset.uploadId = String(node.attrs.uploadId)
  details.className = 'kb-media-upload__details'
  actions.className = 'kb-media-upload__actions'
  title.textContent = String(node.attrs.fileName || 'Media')
  message.textContent = node.attrs.status === 'failed'
    ? String(node.attrs.error || 'Upload failed.')
    : 'Uploading…'

  retry.type = 'button'
  retry.textContent = 'Retry'
  retry.hidden = node.attrs.status !== 'failed'
  retry.addEventListener('click', () => {
    const storage = editor.storage as unknown as {
      mediaUpload?: { controller?: EditorMediaUploadController }
    }
    const controller = storage.mediaUpload?.controller
    controller?.retry(editor, String(node.attrs.uploadId))
  })

  remove.type = 'button'
  remove.textContent = 'Remove'
  remove.addEventListener('click', () => {
    const storage = editor.storage as unknown as {
      mediaUpload?: { controller?: EditorMediaUploadController }
    }
    const controller = storage.mediaUpload?.controller
    controller?.remove(editor, String(node.attrs.uploadId))
  })

  details.append(title, message)
  actions.append(retry, remove)
  dom.append(details, actions)

  return {
    dom,
    update(updatedNode) {
      if (updatedNode.type.name !== MEDIA_UPLOAD_NODE_NAME) return false
      message.textContent = updatedNode.attrs.status === 'failed'
        ? String(updatedNode.attrs.error || 'Upload failed.')
        : 'Uploading…'
      retry.hidden = updatedNode.attrs.status !== 'failed'
      return true
    }
  }
}

export const MediaUploadNode = Node.create({
  name: MEDIA_UPLOAD_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return {
      controller: null as EditorMediaUploadController | null
    }
  },

  addAttributes() {
    return {
      uploadId: { default: null },
      fileName: { default: null },
      mediaKind: { default: 'attachment' },
      status: { default: 'uploading' },
      error: { default: null }
    }
  },

  parseHTML() {
    return []
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      {
        'data-kb-media-upload': HTMLAttributes.uploadId,
        'data-status': HTMLAttributes.status
      },
      String(HTMLAttributes.fileName || 'Media upload')
    ]
  },

  addNodeView() {
    return ({ editor, node }) => createUploadNodeView(editor, node)
  }
})

export const mediaNodeExtensions = [
  VideoNode,
  AttachmentNode,
  DocumentEmbedNode,
  ExternalEmbedNode,
  MediaUploadNode
]
