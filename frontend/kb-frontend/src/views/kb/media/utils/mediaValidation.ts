import type { MediaKind } from '@/types/apps/mediaTypes'

export const MAX_MEDIA_FILE_SIZE_BYTES = 100 * 1024 * 1024

export const MEDIA_KIND_OPTIONS: Array<{ value: MediaKind; label: string }> = [
  { value: 'image', label: 'Images' },
  { value: 'gif', label: 'GIFs' },
  { value: 'video', label: 'Videos' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documents' }
]

export const SUPPORTED_MEDIA_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tif', '.tiff',
  '.pdf',
  '.mp4', '.mov', '.webm', '.avi', '.mpeg', '.mpg',
  '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp',
  '.doc', '.xls', '.ppt', '.rtf', '.txt', '.md', '.csv', '.json', '.xml'
] as const

const supportedExtensionSet = new Set<string>(SUPPORTED_MEDIA_EXTENSIONS)

export const MEDIA_FILE_ACCEPT = SUPPORTED_MEDIA_EXTENSIONS.join(',')

export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]

  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }

  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`
}

export const validateMediaFile = (file: File): string[] => {
  const errors: string[] = []
  const extensionIndex = file.name.lastIndexOf('.')
  const extension = extensionIndex >= 0 ? file.name.slice(extensionIndex).toLowerCase() : ''

  if (!file.name.trim() || file.name.length > 260 || /[\\/:]/.test(file.name))
    errors.push('The filename is invalid or longer than 260 characters.')

  if (!supportedExtensionSet.has(extension))
    errors.push('This file type is not supported.')

  if (file.size <= 0)
    errors.push('The file is empty.')
  else if (file.size > MAX_MEDIA_FILE_SIZE_BYTES)
    errors.push(`The file exceeds the ${formatFileSize(MAX_MEDIA_FILE_SIZE_BYTES)} upload limit.`)

  return errors
}

export const mediaKindFromMimeType = (mimeType: string): MediaKind => {
  if (mimeType.toLowerCase() === 'image/gif') return 'gif'
  if (mimeType.toLowerCase().startsWith('image/')) return 'image'
  if (mimeType.toLowerCase().startsWith('video/')) return 'video'
  if (mimeType.toLowerCase() === 'application/pdf') return 'pdf'

  return 'document'
}
