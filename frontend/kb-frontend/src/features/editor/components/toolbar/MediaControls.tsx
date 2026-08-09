'use client'

import { FloatingPortal } from '@floating-ui/react'
import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { Film, FolderOpen, ImagePlus, Paperclip } from 'lucide-react'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import type { MediaListItemResponse } from '@/types/apps/mediaTypes'
import MediaPreview from '@/views/kb/media/MediaPreview'
import { MEDIA_FILE_ACCEPT } from '@/views/kb/media/utils/mediaValidation'
import type {
  EditorMediaPickerKind,
  EditorMediaUploadController
} from '../../media/mediaTypes'
import {
  DropdownItem,
  ToolbarDropdown
} from './ToolbarPrimitives'

export const MEDIA_ACTION_EVENT = 'kb:media-action'

type MediaActionEvent = CustomEvent<{ kind: EditorMediaPickerKind }>

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff'
const VIDEO_ACCEPT = '.mp4,.mov,.webm,.avi,.mpeg,.mpg'

function MediaLibraryDialog({
  accessToken,
  api,
  editor,
  controller,
  onClose
}: {
  accessToken: string
  api: MediaLibraryApi
  editor: Editor
  controller: EditorMediaUploadController
  onClose: () => void
}) {
  const [items, setItems] = useState<MediaListItemResponse[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const abort = new AbortController()
    const query = {
      page: 1,
      pageSize: 100,
      search: search.trim() || undefined,
      status: 'Active' as const
    }
    void Promise.all([
      api.getList({ ...query, mediaType: 'image' }, accessToken, abort.signal),
      api.getList({ ...query, mediaType: 'gif' }, accessToken, abort.signal)
    ]).then(
      responses => {
        setItems(responses.flatMap(response => response.items)
          .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)))
        setLoading(false)
      },
      reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'The media library could not be loaded.')
        setLoading(false)
      }
    )
    return () => abort.abort()
  }, [accessToken, api, search])

  return (
    <FloatingPortal>
      <div
        className='fixed inset-0 z-50 flex items-start justify-center bg-gray-900/20 px-4 py-16'
        onMouseDown={event => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          role='dialog'
          aria-modal='true'
          aria-label='Choose image from Media Library'
          className='max-h-[75vh] w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/10'
        >
          <div className='border-b border-gray-200 p-4'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='font-semibold text-gray-900'>Choose from Media Library</h2>
              <button type='button' onClick={onClose} className='text-sm text-gray-600'>Close</button>
            </div>
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setLoading(true)
                setError('')
              }}
              placeholder='Search images'
              className='w-full rounded border border-gray-300 px-3 py-2 text-sm'
            />
          </div>
          <div className='max-h-[55vh] overflow-y-auto p-3'>
            {loading && <p className='p-4 text-sm text-gray-500'>Loading media…</p>}
            {error && <p role='alert' className='p-4 text-sm text-red-600'>{error}</p>}
            {!loading && !error && items.length === 0 && (
              <p className='p-4 text-sm text-gray-500'>No active images matched your search.</p>
            )}
            <div className='grid gap-2 sm:grid-cols-2'>
              {items.map(item => (
                <button
                  key={item.mediaId}
                  type='button'
                  className='flex min-w-0 items-center gap-3 rounded border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50'
                  onClick={() => {
                    if (controller.insertMedia(editor, item)) onClose()
                  }}
                >
                  <MediaPreview file={item} accessToken={accessToken} api={api} />
                  <span className='min-w-0'>
                    <strong className='block truncate text-sm text-gray-900'>{item.originalFileName}</strong>
                    <span className='block truncate text-xs text-gray-500'>{item.mimeType}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FloatingPortal>
  )
}

export function MediaControls({
  editor,
  controller,
  accessToken,
  api
}: {
  editor: Editor
  controller: EditorMediaUploadController
  accessToken: string
  api: MediaLibraryApi
}) {
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const attachmentInput = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const open = (kind: EditorMediaPickerKind) => {
    if (!editor.isEditable) return
    if (kind === 'image') imageInput.current?.click()
    else if (kind === 'video') videoInput.current?.click()
    else if (kind === 'attachment') attachmentInput.current?.click()
    else setLibraryOpen(true)
  }

  useEffect(() => {
    const element = editor.view.dom
    const listener = (event: Event) => open((event as MediaActionEvent).detail.kind)
    element.addEventListener(MEDIA_ACTION_EVENT, listener)
    return () => element.removeEventListener(MEDIA_ACTION_EVENT, listener)
  })

  const input = (
    ref: React.RefObject<HTMLInputElement | null>,
    accept: string
  ) => (
    <input
      ref={ref}
      hidden
      type='file'
      multiple
      accept={accept}
      onChange={event => {
        controller.uploadFiles(editor, Array.from(event.currentTarget.files ?? []), 'toolbar')
        event.currentTarget.value = ''
      }}
    />
  )

  return (
    <>
      <ToolbarDropdown
        title='Insert or attach media'
        label={<><Paperclip className='h-4 w-4' /> Media</>}
        menuClassName='w-56'
      >
        <DropdownItem onActivate={() => open('image')}>
          <span className='flex items-center gap-2'><ImagePlus className='h-4 w-4' /> Upload from device</span>
        </DropdownItem>
        <DropdownItem onActivate={() => open('library')}>
          <span className='flex items-center gap-2'><FolderOpen className='h-4 w-4' /> Choose from Media Library</span>
        </DropdownItem>
        <DropdownItem onActivate={() => open('video')}>
          <span className='flex items-center gap-2'><Film className='h-4 w-4' /> Upload video</span>
        </DropdownItem>
        <DropdownItem onActivate={() => open('attachment')}>
          <span className='flex items-center gap-2'><Paperclip className='h-4 w-4' /> Upload attachment</span>
        </DropdownItem>
      </ToolbarDropdown>
      {input(imageInput, IMAGE_ACCEPT)}
      {input(videoInput, VIDEO_ACCEPT)}
      {input(attachmentInput, MEDIA_FILE_ACCEPT)}
      {libraryOpen && (
        <MediaLibraryDialog
          accessToken={accessToken}
          api={api}
          editor={editor}
          controller={controller}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </>
  )
}
