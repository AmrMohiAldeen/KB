import { describe, expect, it } from 'vitest'

import { formatViewerMessage, getViewerMessages } from './viewerMessages'

describe('viewer messages', () => {
  it('selects Arabic viewer UI resources and falls back to the default resource file', () => {
    expect(getViewerMessages('ar').searchResults).toBe('نتائج البحث')
    expect(getViewerMessages('new-locale').searchResults).toBe('Search results')
  })

  it('formats placeholders without coupling UI text to article translations', () => {
    expect(formatViewerMessage(getViewerMessages('en').searchPlaceholder, { portal: 'Support' }))
      .toBe('Search Support')
  })
})
