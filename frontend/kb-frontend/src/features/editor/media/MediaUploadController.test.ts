import { Editor, type JSONContent } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaUploadResponse } from '@/types/apps/mediaTypes'
import { getEditorExtensions } from '../extensions'
import { createEditorMediaUploadController } from './MediaUploadController'
import {
  extractMediaIds,
  sanitizeDraftMediaContent
} from './mediaDocument'

const editors: Editor[] = []

const response = (
  mediaId: string,
  name: string,
  mimeType: string
): MediaUploadResponse => ({
  mediaId,
  originalFileName: name,
  mimeType,
  fileExtension: `.${name.split('.').at(-1)}`,
  fileSizeBytes: 12,
  url: `/api/media/${mediaId}/content`,
  status: 'Active',
  uploadedAt: '2026-07-27T10:00:00Z'
})

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function createEditor(editable = true) {
  const element = document.createElement('div')
  document.body.append(element)
  const editor = new Editor({
    element,
    editable,
    extensions: getEditorExtensions()
  })
  editors.push(editor)
  return editor
}

function nodes(editor: Editor, type: string): JSONContent[] {
  const matches: JSONContent[] = []
  const visit = (node: JSONContent) => {
    if (node.type === type) matches.push(node)
    node.content?.forEach(visit)
  }
  visit(editor.getJSON())
  return matches
}

afterEach(() => {
  editors.splice(0).forEach(editor => editor.destroy())
  document.body.replaceChildren()
})

describe('editor media upload controller', () => {
  it('uploads pasted images without serializing Base64 and keeps animated GIF MIME metadata', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce(response('11111111-1111-1111-1111-111111111111', 'diagram.png', 'image/png'))
      .mockResolvedValueOnce(response('22222222-2222-2222-2222-222222222222', 'animated.gif', 'image/gif'))
    const controller = createEditorMediaUploadController({ upload })
    const editor = createEditor()

    controller.uploadFiles(editor, [
      new File(['png'], 'diagram.png', { type: 'image/png' }),
      new File(['gif'], 'animated.gif', { type: 'image/gif' })
    ], 'paste')

    expect(nodes(editor, 'mediaUpload')).toHaveLength(2)
    expect(JSON.stringify(editor.getJSON())).not.toMatch(/base64|blob:/i)
    expect(sanitizeDraftMediaContent(editor.getJSON())).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph' }]
    })

    await flush()

    const images = nodes(editor, 'image')
    expect(images).toHaveLength(2)
    expect(images[1].attrs).toMatchObject({
      mediaId: '22222222-2222-2222-2222-222222222222',
      mimeType: 'image/gif',
      src: '/api/media/22222222-2222-2222-2222-222222222222/content'
    })
  })

  it('inserts multiple dropped video and attachment files in drop order', () => {
    const upload = vi.fn(() => new Promise<MediaUploadResponse>(() => undefined))
    const controller = createEditorMediaUploadController({ upload })
    const editor = createEditor()

    controller.uploadFiles(editor, [
      new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      new File(['pdf'], 'guide.pdf', { type: 'application/pdf' })
    ], 'drop', 1)

    expect(nodes(editor, 'mediaUpload').map(node => node.attrs?.fileName)).toEqual([
      'clip.mp4',
      'guide.pdf'
    ])
    expect(upload).toHaveBeenCalledTimes(2)
  })

  it('keeps failed files for retry and removes failed placeholders on request', async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('Azurite unavailable'))
      .mockResolvedValueOnce(response('33333333-3333-3333-3333-333333333333', 'retry.png', 'image/png'))
      .mockRejectedValueOnce(new Error('still unavailable'))
    const controller = createEditorMediaUploadController({ upload })
    const editor = createEditor()
    const first = new File(['retry'], 'retry.png', { type: 'image/png' })

    controller.uploadFiles(editor, [first], 'paste')
    await flush()

    const failed = nodes(editor, 'mediaUpload')[0]
    expect(failed.attrs).toMatchObject({ status: 'failed', error: 'Azurite unavailable' })
    controller.retry(editor, String(failed.attrs?.uploadId))
    await flush()

    expect(nodes(editor, 'image')[0].attrs?.mediaId).toBe(
      '33333333-3333-3333-3333-333333333333'
    )

    controller.uploadFiles(
      editor,
      [new File(['remove'], 'remove.png', { type: 'image/png', lastModified: 2 })],
      'paste'
    )
    await flush()
    const removable = nodes(editor, 'mediaUpload')[0]
    controller.remove(editor, String(removable.attrs?.uploadId))
    expect(nodes(editor, 'mediaUpload')).toHaveLength(0)
  })

  it('blocks uploads in read-only mode and deduplicates repeated events', () => {
    const upload = vi.fn(() => new Promise<MediaUploadResponse>(() => undefined))
    const controller = createEditorMediaUploadController({ upload })
    const readOnly = createEditor(false)
    const file = new File(['same'], 'same.png', {
      type: 'image/png',
      lastModified: 10
    })

    controller.uploadFiles(readOnly, [file], 'paste')
    expect(upload).not.toHaveBeenCalled()

    const editable = createEditor()
    controller.uploadFiles(editable, [file], 'paste')
    controller.uploadFiles(editable, [file], 'paste')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(nodes(editable, 'mediaUpload')).toHaveLength(1)
  })

  it('removes unresolved nodes and temporary URLs from autosave content and derives final references', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        { type: 'mediaUpload', attrs: { uploadId: 'pending' } },
        { type: 'image', attrs: { src: 'blob:preview', mediaId: null } },
        {
          type: 'video',
          attrs: {
            src: '/api/media/44444444-4444-4444-4444-444444444444/content',
            mediaId: '44444444-4444-4444-4444-444444444444'
          }
        }
      ]
    }

    const sanitized = sanitizeDraftMediaContent(content)
    expect(JSON.stringify(sanitized)).not.toMatch(/mediaUpload|blob:/)
    expect(extractMediaIds(sanitized)).toEqual([
      '44444444-4444-4444-4444-444444444444'
    ])
  })
})
