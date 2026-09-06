import type { ViewerArticleTranslation, ViewerLanguage } from '@/lib/api/viewerKnowledgeBaseApi'

export const VIEWER_LOCALE_COOKIE = 'kb-viewer-locale'

export const getViewerRootPath = (
  rootSlug: string,
  locale: string,
  languages: ViewerLanguage[]
) => {
  const isDefault = languages.find(language => language.localeCode === locale)?.isDefault ?? false
  return isDefault ? `/${rootSlug}` : `/${locale}/${rootSlug}`
}

export const getViewerPath = (
  rootSlug: string,
  locale: string,
  languages: ViewerLanguage[],
  suffix = ''
) => `${getViewerRootPath(rootSlug, locale, languages)}${suffix}`

export const getArticleLanguageTarget = (
  rootSlug: string,
  language: ViewerLanguage,
  languages: ViewerLanguage[],
  translations: ViewerArticleTranslation[]
) => {
  const translation = translations.find(item => item.localeCode === language.localeCode)
  return translation
    ? { href: getViewerPath(rootSlug, language.localeCode, languages, `/articles/${translation.slug}`), fallback: false }
    : { href: `${getViewerRootPath(rootSlug, language.localeCode, languages)}?articleUnavailable=1`, fallback: true }
}

export const persistViewerLocale = (locale: string) => {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${VIEWER_LOCALE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
}
