import type { Editor } from '@tiptap/core'
import type { MediaUploadResponse } from '@/types/apps/mediaTypes'
import {
  mediaKindFromMimeType,
  validateMediaFile
} from '@/views/kb/media/utils/mediaValidation'
import { BLOCK_IMAGE_NODE_NAME } from '../blocks/image/imageTypes'
import type {
  EditorFileUploadContext,
  EditorFileUploadSource
} from '../extensions/FileHandlerIntegration'
import {
  ATTACHMENT_NODE_NAME,
  MEDIA_UPLOAD_NODE_NAME,
  VIDEO_NODE_NAME,
  type EditorMediaItem,
  type EditorMediaUploadController
} from './mediaTypes'

type UploadMedia = (file: File) => Promise<MediaUploadResponse>

type PendingUpload = {
  editor: Editor
  file: File
  uploadId: string
}

type CreateControllerOptions = {
  upload: UploadMedia
  onError?: (message: string) => void
  onResolved?: (fileName: string) => void
}

const duplicateWindowMs = 1500

function fileFingerprint(file: File): string {
  return [file.name, file.type, file.size, file.lastModified].join(':')
}

function uploadKind(file: File): 'image' | 'video' | 'attachment' {
  const kind = mediaKindFromMimeType(file.type)
  if (kind === 'image' || kind === 'gif') return 'image'
  if (kind === 'video') return 'video'
  return 'attachment'
}

function findUploadNode(editor: Editor, uploadId: string): { pos: number; nodeSize: number } | null {
  let found: { pos: number; nodeSize: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== MEDIA_UPLOAD_NODE_NAME || node.attrs.uploadId !== uploadId) return !found
    found = { pos, nodeSize: node.nodeSize }
    return false
  })
  return found
}

function insertAt(editor: Editor, content: Record<string, unknown>, pos?: number): boolean {
  if (!editor.isEditable) return false
  const chain = editor.chain().focus()
  return Number.isInteger(pos)
    ? chain.insertContentAt(pos!, content).run()
    : chain.insertContent(content).run()
}

export function createEditorMediaUploadController({
  upload,
  onError,
  onResolved
}: CreateControllerOptions): EditorMediaUploadController {
  const pending = new Map<string, PendingUpload>()
  const failedFiles = new Map<string, PendingUpload>()
  const recentFiles = new Map<string, number>()
  const listeners = new Set<(pendingCount: number) => void>()
  const contextOffsets = new WeakMap<EditorFileUploadContext, number>()
  const contextBasePositions = new WeakMap<EditorFileUploadContext, number>()

  const notify = () => listeners.forEach(listener => listener(pending.size))

  const replaceUpload = (
    editor: Editor,
    uploadId: string,
    content: Record<string, unknown>
  ): boolean => {
    const found = findUploadNode(editor, uploadId)
    if (!found || !editor.isEditable) return false
    const node = editor.schema.nodeFromJSON(content)
    editor.view.dispatch(
      editor.state.tr.replaceWith(found.pos, found.pos + found.nodeSize, node).scrollIntoView()
    )
    return true
  }

  const insertMedia = (editor: Editor, media: EditorMediaItem, pos?: number): boolean => {
    const attributes = {
      mediaId: media.mediaId,
      src: media.url,
      mimeType: media.mimeType,
      fileName: media.originalFileName,
      fileSize: media.fileSizeBytes
    }
    const kind = mediaKindFromMimeType(media.mimeType)

    if (kind === 'image' || kind === 'gif') {
      return insertAt(editor, {
        type: BLOCK_IMAGE_NODE_NAME,
        attrs: {
          ...attributes,
          alt: media.originalFileName
        }
      }, pos)
    }
    if (kind === 'video') {
      return insertAt(editor, {
        type: VIDEO_NODE_NAME,
        attrs: {
          ...attributes,
          title: media.originalFileName
        }
      }, pos)
    }
    return insertAt(editor, {
      type: ATTACHMENT_NODE_NAME,
      attrs: attributes
    }, pos)
  }

  const complete = (entry: PendingUpload, media: MediaUploadResponse) => {
    const attributes = {
      mediaId: media.mediaId,
      src: media.url,
      mimeType: media.mimeType,
      fileName: media.originalFileName,
      fileSize: media.fileSizeBytes
    }
    const kind = mediaKindFromMimeType(media.mimeType)
    const content = kind === 'image' || kind === 'gif'
      ? {
          type: BLOCK_IMAGE_NODE_NAME,
          attrs: { ...attributes, alt: media.originalFileName }
        }
      : kind === 'video'
        ? {
            type: VIDEO_NODE_NAME,
            attrs: { ...attributes, title: media.originalFileName }
          }
        : { type: ATTACHMENT_NODE_NAME, attrs: attributes }

    replaceUpload(entry.editor, entry.uploadId, content)
    pending.delete(entry.uploadId)
    failedFiles.delete(entry.uploadId)
    onResolved?.(entry.file.name)
    notify()
  }

  const fail = (entry: PendingUpload, error: unknown) => {
    failedFiles.set(entry.uploadId, entry)
    const found = findUploadNode(entry.editor, entry.uploadId)
    if (found && entry.editor.isEditable) {
      const message = error instanceof Error ? error.message : 'Upload failed. Try again.'
      entry.editor.view.dispatch(
        entry.editor.state.tr.setNodeMarkup(found.pos, undefined, {
          ...entry.editor.state.doc.nodeAt(found.pos)?.attrs,
          status: 'failed',
          error: message
        })
      )
      onError?.(`${entry.file.name}: ${message}`)
    }
    pending.delete(entry.uploadId)
    notify()
  }

  const start = (entry: PendingUpload) => {
    pending.set(entry.uploadId, entry)
    notify()
    void upload(entry.file).then(
      media => complete(entry, media),
      error => fail(entry, error)
    )
  }

  const enqueue = (
    file: File,
    context: EditorFileUploadContext,
    explicitPos?: number
  ) => {
    if (!context.editor.isEditable) return
    if (context.source === 'paste' && !/^image\//i.test(file.type)) {
      onError?.(`${file.name}: Only images and GIFs can be pasted.`)
      return
    }

    const errors = validateMediaFile(file)
    if (errors.length) {
      onError?.(`${file.name}: ${errors.join(' ')}`)
      return
    }

    const fingerprint = fileFingerprint(file)
    const now = Date.now()
    const previous = recentFiles.get(fingerprint)
    if (previous != null && now - previous < duplicateWindowMs) return
    recentFiles.set(fingerprint, now)

    const uploadId = crypto.randomUUID()
    const offset = contextOffsets.get(context) ?? 0
    const basePos = contextBasePositions.get(context) ??
      (Number.isInteger(context.pos) ? context.pos! : context.editor.state.selection.from)
    contextBasePositions.set(context, basePos)
    const pos = explicitPos ?? basePos + offset
    contextOffsets.set(context, offset + 1)

    const inserted = insertAt(context.editor, {
      type: MEDIA_UPLOAD_NODE_NAME,
      attrs: {
        uploadId,
        fileName: file.name,
        mediaKind: uploadKind(file),
        status: 'uploading',
        error: null
      }
    }, pos)
    if (!inserted) return

    const storage = context.editor.storage as unknown as {
      mediaUpload: { controller: EditorMediaUploadController | null }
    }
    storage.mediaUpload.controller = controller
    start({ editor: context.editor, file, uploadId })
  }

  const controller: EditorMediaUploadController = {
    adapter(file, context) {
      enqueue(file, context)
    },
    uploadFiles(editor, files, source: EditorFileUploadSource = 'toolbar', pos) {
      const context: EditorFileUploadContext = { editor, pos, source }
      files.forEach(file => enqueue(file, context))
    },
    insertMedia,
    retry(editor, uploadId) {
      if (!editor.isEditable || pending.has(uploadId)) return
      const found = findUploadNode(editor, uploadId)
      if (!found) return
      const fileEntry = failedFiles.get(uploadId)
      if (!fileEntry) return
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(found.pos, undefined, {
          ...editor.state.doc.nodeAt(found.pos)?.attrs,
          status: 'uploading',
          error: null
        })
      )
      start(fileEntry)
    },
    remove(editor, uploadId) {
      const found = findUploadNode(editor, uploadId)
      if (!found || !editor.isEditable) return
      editor.view.dispatch(editor.state.tr.delete(found.pos, found.pos + found.nodeSize))
      pending.delete(uploadId)
      failedFiles.delete(uploadId)
      notify()
    },
    getPendingCount: () => pending.size,
    subscribe(listener) {
      listeners.add(listener)
      listener(pending.size)
      return () => listeners.delete(listener)
    }
  }

  return controller
}
