import type { Editor } from '@tiptap/core'
import type {
  MediaListItemResponse,
  MediaUploadResponse
} from '@/types/apps/mediaTypes'
import type {
  EditorFileUploadAdapter,
  EditorFileUploadSource
} from '../extensions/FileHandlerIntegration'

export const MEDIA_UPLOAD_NODE_NAME = 'mediaUpload'
export const VIDEO_NODE_NAME = 'video'
export const ATTACHMENT_NODE_NAME = 'attachment'

export type EditorMediaItem = MediaUploadResponse | MediaListItemResponse
export type EditorMediaPickerKind = 'image' | 'video' | 'attachment' | 'library'
export type EditorMediaUploadStatus = 'uploading' | 'failed'

export type EditorMediaUploadController = {
  adapter: EditorFileUploadAdapter
  uploadFiles: (
    editor: Editor,
    files: readonly File[],
    source?: EditorFileUploadSource,
    pos?: number
  ) => void
  insertMedia: (editor: Editor, media: EditorMediaItem, pos?: number) => boolean
  retry: (editor: Editor, uploadId: string) => void
  remove: (editor: Editor, uploadId: string) => void
  getPendingCount: () => number
  subscribe: (listener: (pendingCount: number) => void) => () => void
}

export type PersistentMediaAttributes = {
  mediaId: string
  src: string
  mimeType: string
  fileName: string
  fileSize: number
}
