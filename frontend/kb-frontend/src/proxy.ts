// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getLocalizedUrl, isUrlMissingLocale } from '@/utils/i18n'
import { ensurePrefix } from '@/utils/string'

// Constants
const HOME_PAGE_URL = '/dashboard'
export const VIEWER_LOCALE_COOKIE = 'kb-viewer-locale'
const INTERNAL_ROOTS = new Set([
  'dashboard', 'kb', 'audit-logs', 'editor', 'export-jobs', 'media', 'notifications', 'review', 'roles',
  'settings', 'templates', 'users', 'account', 'reusable-blocks', 'search-index', 'not-authorized'
])

export const resolveLocale = (urlLocale?: string, cookieLocale?: string): string => {
  if (urlLocale && i18n.locales.includes(urlLocale as (typeof i18n.locales)[number])) return urlLocale
  if (cookieLocale && i18n.locales.includes(cookieLocale as (typeof i18n.locales)[number])) return cookieLocale
  return i18n.defaultLocale
}

const getLocale = (request: NextRequest): string => {
  const urlLocale = i18n.locales.find(locale =>
    request.nextUrl.pathname === `/${locale}` || request.nextUrl.pathname.startsWith(`/${locale}/`)
  )
  return resolveLocale(urlLocale, request.cookies.get(VIEWER_LOCALE_COOKIE)?.value)
}

const localizedRedirect = (
  url: string,
  locale: string,
  request: NextRequest
) => {
  let redirectUrl = url

  if (isUrlMissingLocale(redirectUrl)) {
    redirectUrl = getLocalizedUrl(redirectUrl, locale)
  }

  const basePath = process.env.BASEPATH ?? ''

  redirectUrl = ensurePrefix(redirectUrl, basePath)

  return NextResponse.redirect(new URL(redirectUrl, request.url))
}

export function proxy(request: NextRequest) {
  const locale = getLocale(request)
  const pathname = request.nextUrl.pathname
  const urlLocale = i18n.locales.find(value => pathname === `/${value}` || pathname.startsWith(`/${value}/`))

  if (pathname === '/' || pathname === `/${locale}`) {
    return localizedRedirect(HOME_PAGE_URL, locale, request)
  }

  if (isUrlMissingLocale(pathname)) {
    const firstSegment = pathname.split('/').filter(Boolean)[0]
    if (firstSegment && !INTERNAL_ROOTS.has(firstSegment)) {
      const url = request.nextUrl.clone()
      url.pathname = getLocalizedUrl(pathname, locale)
      const cookieLocale = request.cookies.get(VIEWER_LOCALE_COOKIE)?.value
      if (!cookieLocale || !i18n.locales.includes(cookieLocale as (typeof i18n.locales)[number])) {
        // The locale segment exists only for internal route matching. Let the Viewer API resolve its configured default.
        url.searchParams.set('__viewerDefaultLocale', '1')
      }
      return NextResponse.rewrite(url)
    }
    return localizedRedirect(pathname, locale, request)
  }

  const response = NextResponse.next()
  if (urlLocale) response.cookies.set(VIEWER_LOCALE_COOKIE, urlLocale, {
    path: '/', maxAge: 31_536_000, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:'
  })
  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|next.svg|vercel.svg).*)'
  ]
}
