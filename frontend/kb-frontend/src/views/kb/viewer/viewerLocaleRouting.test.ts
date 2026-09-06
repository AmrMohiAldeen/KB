import { describe, expect, it } from 'vitest'

import type { ViewerLanguage } from '@/lib/api/viewerKnowledgeBaseApi'
import { getArticleLanguageTarget, getViewerPath, getViewerRootPath, persistViewerLocale,
  VIEWER_LOCALE_COOKIE } from './viewerLocaleRouting'

const languages: ViewerLanguage[] = [
  { localeCode: 'fr', displayName: 'French', nativeName: 'Français', isDefault: true, isRtl: false },
  { localeCode: 'ar', displayName: 'Arabic', nativeName: 'العربية', isDefault: false, isRtl: true }
]

describe('viewer locale routing', () => {
  it('keeps the configured default language on the clean solution route', () => {
    expect(getViewerRootPath('swiftassess', 'fr', languages)).toBe('/swiftassess')
  })

  it('places non-default locales before the solution route', () => {
    expect(getViewerPath('swiftassess', 'ar', languages, '/articles/start')).toBe(
      '/ar/swiftassess/articles/start'
    )
  })

  it('switches directly to a published translated counterpart supplied by the viewer API', () => {
    expect(getArticleLanguageTarget('swiftassess', languages[1], languages, [
      { articleId: 'article-ar', localeCode: 'ar', slug: 'البدء' }
    ])).toEqual({ href: '/ar/swiftassess/articles/البدء', fallback: false })
  })

  it('falls back to the selected-language dashboard with an unavailable notice', () => {
    expect(getArticleLanguageTarget('swiftassess', languages[1], languages, [])).toEqual({
      href: '/ar/swiftassess?articleUnavailable=1', fallback: true
    })
  })

  it('persists the selected viewer locale in a site-wide cookie', () => {
    persistViewerLocale('ar')

    expect(document.cookie).toContain(`${VIEWER_LOCALE_COOKIE}=ar`)
    document.cookie = `${VIEWER_LOCALE_COOKIE}=; Path=/; Max-Age=0`
  })
})
