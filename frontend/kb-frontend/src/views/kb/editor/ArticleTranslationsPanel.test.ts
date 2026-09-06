import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArticleTranslationsPanel from './ArticleTranslationsPanel'
import { getArticleTranslations, getTranslationLanguages } from '@/lib/api/translationsApi'
import { deleteArticle } from '@/lib/api/articlesApi'
import { getCategoryTree } from '@/lib/api/categories'

vi.mock('@/lib/api/translationsApi', () => ({
  assignArticleTranslator: vi.fn(), createArticleTranslation: vi.fn(), getArticleTranslations: vi.fn(),
  getTranslationLanguages: vi.fn(), linkArticleTranslation: vi.fn(), previewLocalizationSync: vi.fn(),
  synchronizeLocalizations: vi.fn(), unlinkArticleTranslation: vi.fn(), verifyArticleTranslation: vi.fn()
}))
vi.mock('@/lib/api/categories', () => ({ getCategoryTree: vi.fn() }))
vi.mock('@/lib/api/articlesApi', () => ({ deleteArticle: vi.fn() }))

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

  it('offers automatic translation from the Add Translation workflow selector', async () => {
    vi.mocked(getArticleTranslations).mockResolvedValue([])
    vi.mocked(getTranslationLanguages).mockResolvedValue([
      { localeCode: 'ar', displayName: 'Arabic', nativeName: 'العربية', isRtl: true }
    ])
    vi.mocked(getCategoryTree).mockResolvedValue([])

    await act(async () => root.render(createElement(ArticleTranslationsPanel, {
      articleId: 'article-1', accessToken: 'authenticated-session-token', article: null,
      onOpenArticle: vi.fn(), onCompare: vi.fn()
    })))

    const addButton = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes('Add Translation'))
    await act(async () => addButton?.click())
    const workflow = document.body.querySelector('[role="combobox"]') as HTMLElement
    await act(async () => {
      workflow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await new Promise(resolve => window.setTimeout(resolve, 0))
    })
    const automatic = Array.from(document.body.querySelectorAll('[role="option"], [role="menuitem"]')).find(item => item.textContent?.includes('Automatic Translation')) as HTMLElement
    await act(async () => automatic.click())

    expect(document.body.textContent).toContain('Automatically translate article')
    expect(Array.from(document.body.querySelectorAll('button')).some(item => item.textContent?.includes('Translate article'))).toBe(true)
  })

  it('deletes the current translated article and returns to its source', async () => {
    const onOpenArticle = vi.fn()
    vi.mocked(getArticleTranslations).mockResolvedValue([{
      articleId: 'article-1', translationGroupId: 'group-1', localeCode: 'fr', title: 'French guide', slug: 'french-guide',
      workflowStatus: 'Draft', translationStatus: 'NeedsVerification', translationMethod: 'Automatic',
      sourceArticleId: 'source-1', sourceVersionId: null, sourceVersionNumber: null, assignedTranslatorUserId: null,
      lastTranslatedAt: null, verifiedAt: null, verifiedByUserId: null, currentSourceVersionId: null,
      currentSourceVersionNumber: null, isCurrent: null
    }])
    vi.mocked(getTranslationLanguages).mockResolvedValue([])
    vi.mocked(getCategoryTree).mockResolvedValue([])
    vi.mocked(deleteArticle).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await act(async () => root.render(createElement(ArticleTranslationsPanel, {
      articleId: 'article-1', accessToken: 'authenticated-session-token', article: null,
      onOpenArticle, onCompare: vi.fn()
    })))
    const deleteButton = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes('Delete Translation'))
    await act(async () => deleteButton?.click())

    expect(deleteArticle).toHaveBeenCalledWith('article-1', 'authenticated-session-token')
    expect(onOpenArticle).toHaveBeenCalledWith('source-1')
  })
})
