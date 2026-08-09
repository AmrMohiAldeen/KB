import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MediaLibraryApi } from '@/lib/api/mediaApi'
import type { MediaListItemResponse } from '@/types/apps/mediaTypes'
import MediaReferencesDialog from './MediaReferencesDialog'

describe('MediaReferencesDialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => act(() => root.unmount()))

  it('renders the referenced article title as a direct localized editor link', async () => {
    const api = {
      getReferences: vi.fn().mockResolvedValue([{
        referenceId: 'reference-1',
        mediaId: 'media-1',
        articleId: 'article/id',
        articleTitle: 'Linked article',
        articleSlug: 'linked-article',
        articleStatus: 'Archived',
        referenceEntityType: 'Draft',
        referenceEntityId: 'draft-1',
        versionNumber: null
      }])
    } as unknown as MediaLibraryApi
    const file: MediaListItemResponse = {
      mediaId: 'media-1',
      originalFileName: 'image.png',
      mimeType: 'image/png',
      fileExtension: '.png',
      fileSizeBytes: 10,
      url: '/media/image.png',
      status: 'Active',
      uploadedBy: { userId: 'user-1', fullName: 'User' },
      uploadedAt: '2026-08-09T00:00:00Z',
      referenceCount: 1
    }

    await act(async () => {
      root.render(createElement(MediaReferencesDialog, {
        open: true,
        file,
        accessToken: 'token',
        lang: 'en',
        api,
        onClose: vi.fn()
      }))
      await new Promise(resolve => window.setTimeout(resolve, 10))
    })

    const link = [...document.querySelectorAll('a')].find(value => value.textContent === 'Linked article')

    expect(link?.getAttribute('href')).toBe('/en/editor?articleId=article%2Fid')
  })
})
