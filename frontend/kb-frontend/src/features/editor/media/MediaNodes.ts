import {
  Node,
  mergeAttributes,
  type NodeViewRendererProps
} from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import type { NodeView } from '@tiptap/pm/view'
import {
  ATTACHMENT_NODE_NAME,
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
    fileSize: { default: null }
  }
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
    return [{ tag: 'video[data-media-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        controls: 'true',
        preload: 'metadata',
        'data-media-id': HTMLAttributes.mediaId,
        'data-kb-video': 'true'
      })
    ] satisfies DOMOutputSpec
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
  MediaUploadNode
]
