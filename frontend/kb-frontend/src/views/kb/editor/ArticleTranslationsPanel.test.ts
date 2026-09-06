import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArticleTranslationsPanel from './ArticleTranslationsPanel'
import { getArticleTranslations, getTranslationLanguages } from '@/lib/api/translationsApi'
import { getCategoryTree } from '@/lib/api/categories'

vi.mock('@/lib/api/translationsApi', () => ({
  assignArticleTranslator: vi.fn(), createArticleTranslation: vi.fn(), getArticleTranslations: vi.fn(),
  getTranslationLanguages: vi.fn(), linkArticleTranslation: vi.fn(), previewLocalizationSync: vi.fn(),
  synchronizeLocalizations: vi.fn(), unlinkArticleTranslation: vi.fn(), verifyArticleTranslation: vi.fn()
}))
vi.mock('@/lib/api/categories', () => ({ getCategoryTree: vi.fn() }))

describe('ArticleTranslationsPanel', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    vi.mocked(getArticleTranslations).mockRejectedValue(new Error('not loaded'))
    vi.mocked(getTranslationLanguages).mockRejectedValue(new Error('not loaded'))
    vi.mocked(getCategoryTree).mockRejectedValue(new Error('not loaded'))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('keeps Add Translation focusable when async target data is empty or failed', async () => {
    await act(async () => root.render(createElement(ArticleTranslationsPanel, {
      articleId: 'article-1', accessToken: 'authenticated-session-token', article: null,
      onOpenArticle: vi.fn(), onCompare: vi.fn()
    })))

    const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes('Add Translation'))
    expect(button).toBeDefined()
    expect(button?.disabled).toBe(false)

    await act(async () => button?.click())
    expect(document.body.textContent).toContain('Add manual translation')
    expect(getTranslationLanguages).toHaveBeenCalledWith('authenticated-session-token')
  })

  it('offers an enabled configured language in the translation dialog', async () => {
    vi.mocked(getArticleTranslations).mockResolvedValue([])
    vi.mocked(getTranslationLanguages).mockResolvedValue([
      { localeCode: 'fr', displayName: 'French', nativeName: 'Français', isRtl: false }
    ])
    vi.mocked(getCategoryTree).mockResolvedValue([])

    await act(async () => root.render(createElement(ArticleTranslationsPanel, {
      articleId: 'article-1', accessToken: 'authenticated-session-token', article: null,
      onOpenArticle: vi.fn(), onCompare: vi.fn()
    })))

    const button = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes('Add Translation'))
    await act(async () => button?.click())

    expect(document.body.textContent).toContain('French (fr)')
    const createButton = Array.from(document.body.querySelectorAll('button')).find(item => item.textContent?.includes('Create translation'))
    expect(createButton?.disabled).toBe(false)
  })
})
