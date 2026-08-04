import { describe, expect, it } from 'vitest'
import {
  MAX_MEDIA_FILE_SIZE_BYTES,
  formatFileSize,
  mediaKindFromMimeType,
  validateMediaFile
} from './mediaValidation'

describe('media upload validation', () => {
  it('accepts backend-supported image, GIF, video, PDF, and document extensions', () => {
    const supported = [
      new File(['image'], 'photo.jpg', { type: 'image/jpeg' }),
      new File(['gif'], 'animation.gif', { type: 'image/gif' }),
      new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      new File(['pdf'], 'guide.pdf', { type: 'application/pdf' }),
      new File(['text'], 'notes.md', { type: 'text/markdown' })
    ]

    expect(supported.map(validateMediaFile)).toEqual([[], [], [], [], []])
  })

  it('rejects empty, oversized, unsupported, and invalidly named files before upload', () => {
    const empty = new File([], 'empty.txt', { type: 'text/plain' })
    const unsupported = new File(['bad'], 'malware.exe', { type: 'application/octet-stream' })
    const invalidName = new File(['text'], 'bad:name.txt', { type: 'text/plain' })
    const oversized = new File(['large'], 'large.pdf', { type: 'application/pdf' })

    Object.defineProperty(oversized, 'size', { value: MAX_MEDIA_FILE_SIZE_BYTES + 1 })

    expect(validateMediaFile(empty)).toContain('The file is empty.')
    expect(validateMediaFile(unsupported)).toContain('This file type is not supported.')
    expect(validateMediaFile(invalidName)).toContain('The filename is invalid or longer than 260 characters.')
    expect(validateMediaFile(oversized)).toContain(
      `The file exceeds the ${formatFileSize(MAX_MEDIA_FILE_SIZE_BYTES)} upload limit.`
    )
  })

  it('classifies GIF separately so animated previews remain image elements', () => {
    expect(mediaKindFromMimeType('image/gif')).toBe('gif')
    expect(mediaKindFromMimeType('image/png')).toBe('image')
    expect(mediaKindFromMimeType('video/webm')).toBe('video')
    expect(mediaKindFromMimeType('application/pdf')).toBe('pdf')
  })
})
