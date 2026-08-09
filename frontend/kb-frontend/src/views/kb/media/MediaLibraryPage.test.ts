import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import { ApiError } from '@/lib/api/http'
import { AccessTokenProvider } from '@/lib/auth/accessTokenContext'
import type { MediaListItemResponse, MediaListResponse } from '@/types/apps/mediaTypes'
import MediaLibraryPage from './MediaLibraryPage'

const mediaFile = (overrides: Partial<MediaListItemResponse> = {}): MediaListItemResponse => ({
  mediaId: 'media-1',
  originalFileName: 'guide.pdf',
  mimeType: 'application/pdf',
  fileExtension: '.pdf',
  fileSizeBytes: 2048,
  url: '/api/media/media-1/content',
  status: 'Active',
  uploadedBy: { userId: 'user-1', fullName: 'Media Author' },
  uploadedAt: '2026-07-27T10:00:00Z',
  referenceCount: 0,
  ...overrides
})

const response = (
  items: MediaListItemResponse[] = [],
  overrides: Partial<MediaListResponse> = {}
): MediaListResponse => ({
  items,
  page: 1,
  pageSize: 10,
  totalCount: items.length,
  ...overrides
})

const createApi = (overrides: Partial<MediaLibraryApi> = {}): MediaLibraryApi => ({
  getList: vi.fn().mockResolvedValue(response()),
  upload: vi.fn().mockResolvedValue({
    mediaId: 'uploaded-1',
    originalFileName: 'upload.pdf',
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
    fileSizeBytes: 12,
    url: '/api/media/uploaded-1/content',
    status: 'Active',
    uploadedAt: '2026-07-27T10:00:00Z'
  }),
  replace: vi.fn().mockResolvedValue(mediaFile()),
  getReferences: vi.fn().mockResolvedValue([]),
  getContent: vi.fn().mockResolvedValue(new Blob(['content'])),
  download: vi.fn().mockResolvedValue(new Blob(['content'])),
  archive: vi.fn().mockResolvedValue(mediaFile({ status: 'Archived' })),
  restore: vi.fn().mockResolvedValue(mediaFile()),
  deletePermanently: vi.fn().mockResolvedValue(undefined),
  ...overrides
})

describe('MediaLibraryPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  const settle = async (milliseconds = 0) => {
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, milliseconds))
      await Promise.resolve()
    })
  }

  const renderPage = async (api: MediaLibraryApi, accessToken = 'token') => {
    await act(async () => {
      root.render(createElement(MediaLibraryPage, { accessToken, locale: 'en', api }))
    })
    await settle()
  }

  const click = async (element: Element | null) => {
    expect(element).not.toBeNull()

    await act(async () => {
      element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    await settle()
  }

  const buttonByText = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      button => button.textContent?.trim() === label
    ) ?? null

  it('renders backend media rows and their required metadata', async () => {
    const api = createApi({
      getList: vi.fn().mockResolvedValue(response([
        mediaFile(),
        mediaFile({
          mediaId: 'media-2',
          originalFileName: 'walkthrough.mp4',
          mimeType: 'video/mp4',
          fileExtension: '.mp4',
          fileSizeBytes: 8192,
          status: 'Archived',
          referenceCount: 2
        })
      ]))
    })

    await renderPage(api)

    expect(document.body.textContent).toContain('guide.pdf')
    expect(document.body.textContent).toContain('walkthrough.mp4')
    expect(document.body.textContent).toContain('Media Author')
    expect(document.body.textContent).toContain('application/pdf')
    expect(document.body.textContent).toContain('2 references')
    expect(document.querySelector('table[aria-label="Media library table"]')).not.toBeNull()
  })

  it('requests the next backend page from table pagination', async () => {
    const getList = vi.fn().mockResolvedValue(response([mediaFile()], { totalCount: 25 }))
    const api = createApi({ getList })

    await renderPage(api)
    await click(document.querySelector('button[aria-label="Go to next page"]'))
    await settle(25)

    expect(getList).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
      'token',
      expect.any(AbortSignal)
    )
  })

  it('renders filename search and backend-supported media-type filters', async () => {
    const getList = vi.fn().mockResolvedValue(response())
    const api = createApi({ getList })

    await renderPage(api)
    expect(document.querySelector('input[placeholder="Search by filename"]')).not.toBeNull()

    const mediaTypeSelect = document.querySelectorAll<HTMLElement>('[role="combobox"]')[0]

    await act(async () => {
      mediaTypeSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })
    await settle()

    const pdfOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      option => option.textContent?.trim() === 'PDFs'
    )

    expect(pdfOption).not.toBeNull()
  })

  it('validates and completes a successful upload, then refreshes the list', async () => {
    const getList = vi.fn().mockResolvedValue(response())
    const upload = vi.fn().mockImplementation(
      async (_file: File, _token: string, onProgress?: (value: { loaded: number; total: number; percent: number }) => void) => {
        onProgress?.({ loaded: 12, total: 12, percent: 100 })

        return {
          mediaId: 'uploaded-1',
          originalFileName: 'upload.pdf',
          mimeType: 'application/pdf',
          fileExtension: '.pdf',
          fileSizeBytes: 12,
          url: '/api/media/uploaded-1/content',
          status: 'Active',
          uploadedAt: '2026-07-27T10:00:00Z'
        }
      }
    )
    const api = createApi({ getList, upload })

    await renderPage(api)
    await click(buttonByText('Add media'))

    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]')
    const file = new File(['%PDF-1.7 ok'], 'upload.pdf', { type: 'application/pdf' })

    expect(input).not.toBeNull()
    Object.defineProperty(input!, 'files', { configurable: true, value: [file] })
    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    await settle()
    await click(buttonByText('Upload 1 file'))

    expect(upload).toHaveBeenCalledWith(file, 'token', expect.any(Function))
    expect(document.body.textContent).toContain('1 file uploaded successfully.')
    expect(getList.mock.calls.length).toBeGreaterThan(1)
  })

  it('shows a retryable error state when the list API fails', async () => {
    const api = createApi({
      getList: vi.fn().mockRejectedValue(new ApiError(503, {
        status: 503,
        title: 'Service unavailable',
        detail: 'Storage unavailable'
      }))
    })

    await renderPage(api)

    expect(document.body.textContent).toContain('Media library could not be loaded')
    expect(document.body.textContent).toContain('Media storage is temporarily unavailable.')
    expect(buttonByText('Retry')).not.toBeNull()
  })

  it('shows an explicit reference restriction when permanent deletion returns 409', async () => {
    const archived = mediaFile({
      status: 'Archived',
      referenceCount: 3,
      originalFileName: 'referenced.pdf'
    })
    const deletePermanently = vi.fn().mockRejectedValue(new ApiError(409, {
      status: 409,
      title: 'Conflict',
      detail: 'Referenced media cannot be permanently deleted.'
    }))
    const api = createApi({
      getList: vi.fn().mockResolvedValue(response([archived])),
      deletePermanently
    })

    await renderPage(api)
    await click(document.querySelector('button[aria-label="Delete referenced.pdf permanently"]'))
    await click(buttonByText('Delete permanently'))

    expect(deletePermanently).toHaveBeenCalledWith('media-1', 'token')
    expect(document.body.textContent).toContain(
      'This file is still referenced by knowledge base content. Remove all references before deleting it permanently.'
    )
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('loads exact MediaReferences and links each referenced article', async () => {
    const getReferences = vi.fn().mockResolvedValue([
      {
        referenceId: 'reference-1',
        mediaId: 'media-1',
        articleId: 'article-1',
        articleTitle: 'Installing the desktop app',
        articleSlug: 'installing-the-desktop-app',
        articleStatus: 'Draft',
        referenceEntityType: 'Draft',
        referenceEntityId: 'draft-1',
        versionNumber: null
      },
      {
        referenceId: 'reference-2',
        mediaId: 'media-1',
        articleId: 'article-1',
        articleTitle: 'Installing the desktop app',
        articleSlug: 'installing-the-desktop-app',
        articleStatus: 'Draft',
        referenceEntityType: 'Comment',
        referenceEntityId: 'comment-1',
        versionNumber: null
      }
    ])
    const api = createApi({
      getList: vi.fn().mockResolvedValue(response([mediaFile({ referenceCount: 2 })])),
      getReferences
    })

    await renderPage(api)
    await click(buttonByText('2 references'))

    expect(getReferences).toHaveBeenCalledWith('media-1', 'token', expect.any(AbortSignal))
    expect(document.body.textContent).toContain('Installing the desktop app')
    expect(document.body.textContent).toContain('Current draft')
    expect(document.body.textContent).toContain('Article comment')
    expect(document.querySelector<HTMLAnchorElement>('a[href="/en/editor?articleId=article-1"]')).not.toBeNull()
  })

  it('replaces an active image while keeping the media item in place', async () => {
    const replace = vi.fn().mockResolvedValue(mediaFile({ originalFileName: 'after.png' }))
    const getList = vi.fn().mockResolvedValue(response([
      mediaFile({ originalFileName: 'before.png', mimeType: 'image/png', fileExtension: '.png' })
    ]))
    const api = createApi({ getList, replace })

    await renderPage(api)
    await click(document.querySelector('button[aria-label="Replace before.png"]'))
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".png"]')
    const replacement = new File(['replacement'], 'after.png', { type: 'image/png' })
    Object.defineProperty(input!, 'files', { configurable: true, value: [replacement] })
    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    await click(buttonByText('Replace image'))

    expect(replace).toHaveBeenCalledWith('media-1', replacement, 'token', expect.any(Function))
    expect(document.body.textContent).toContain('now replaces the previous image everywhere it is referenced')
    expect(getList.mock.calls.length).toBeGreaterThan(1)
  })

  it('shows a dedicated unauthorized state and does not call the backend without a token', async () => {
    const api = createApi()

    await renderPage(api, '')

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).toContain('Sign in through the company authentication provider')
    expect(api.getList).not.toHaveBeenCalled()
    expect(buttonByText('Add media')?.disabled).toBe(true)
  })

  it('clears a stale signed-out state when a session token becomes available', async () => {
    const api = createApi({ getList: vi.fn().mockResolvedValue(response([mediaFile()])) })

    await renderPage(api, '')

    await act(async () => {
      root.render(createElement(MediaLibraryPage, { accessToken: 'fresh-token', locale: 'en', api }))
    })
    await settle()

    expect(api.getList).toHaveBeenCalledWith(expect.any(Object), 'fresh-token', expect.any(AbortSignal))
    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).toContain('guide.pdf')
    expect(buttonByText('Add media')?.disabled).toBe(false)
  })

  it('uses the persistent dashboard-layout token during client navigation', async () => {
    const api = createApi({ getList: vi.fn().mockResolvedValue(response([mediaFile()])) })

    await act(async () => {
      // createElement requires this provider's required children prop in a non-TSX test file.
      // eslint-disable-next-line react/no-children-prop
      root.render(createElement(
        AccessTokenProvider,
        {
          accessToken: 'layout-token',
          children: createElement(MediaLibraryPage, { locale: 'en', api })
        }
      ))
    })
    await settle()

    expect(api.getList).toHaveBeenCalledWith(expect.any(Object), 'layout-token', expect.any(AbortSignal))
    expect(document.body.textContent).toContain('guide.pdf')
    expect(document.body.textContent).not.toContain('Sign in required')
  })

  it('separates expired sessions from authorization failures', async () => {
    const expiredApi = createApi({
      getList: vi.fn().mockRejectedValue(new ApiError(401, { status: 401, title: 'Unauthorized' }))
    })

    await renderPage(expiredApi)

    expect(document.body.textContent).toContain('Sign in required')
    expect(document.body.textContent).not.toContain('Media library could not be loaded')
    expect(buttonByText('Add media')?.disabled).toBe(true)

    const forbiddenApi = createApi({
      getList: vi.fn().mockRejectedValue(new ApiError(403, { status: 403, title: 'Forbidden' }))
    })

    await act(async () => {
      root.render(createElement(MediaLibraryPage, { accessToken: 'token', locale: 'en', api: forbiddenApi }))
    })
    await settle()

    expect(document.body.textContent).not.toContain('Sign in required')
    expect(document.body.textContent).toContain('Media library could not be loaded')
    expect(document.body.textContent).toContain('You do not have permission')
  })
})
