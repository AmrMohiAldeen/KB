// Next Imports
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Third-party Imports
import Negotiator from 'negotiator'
import { match as matchLocale } from '@formatjs/intl-localematcher'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getLocalizedUrl, isUrlMissingLocale } from '@/utils/i18n'
import { ensurePrefix } from '@/utils/string'

// Constants
const HOME_PAGE_URL = '/dashboard'
const INTERNAL_ROOTS = new Set([
  'dashboard', 'kb', 'audit-logs', 'editor', 'export-jobs', 'media', 'notifications', 'review', 'roles',
  'settings', 'templates', 'users', 'account', 'reusable-blocks', 'search-index', 'not-authorized'
])

const getLocale = (request: NextRequest): string => {
  const urlLocale = i18n.locales.find(locale =>
    request.nextUrl.pathname === `/${locale}` || request.nextUrl.pathname.startsWith(`/${locale}/`)
  )

  if (urlLocale) return urlLocale

  const negotiatorHeaders: Record<string, string> = {}

  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value
  })

  // @ts-expect-error locales are readonly
  const locales: string[] = i18n.locales

  const languages = new Negotiator({ headers: negotiatorHeaders }).languages(locales)

  return matchLocale(languages, locales, i18n.defaultLocale)
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

  if (pathname === '/' || pathname === `/${locale}`) {
    return localizedRedirect(HOME_PAGE_URL, locale, request)
  }

  if (isUrlMissingLocale(pathname)) {
    const firstSegment = pathname.split('/').filter(Boolean)[0]
    if (firstSegment && !INTERNAL_ROOTS.has(firstSegment)) {
      const url = request.nextUrl.clone()
      url.pathname = getLocalizedUrl(pathname, locale)
      return NextResponse.rewrite(url)
    }
    return localizedRedirect(pathname, locale, request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|images|next.svg|vercel.svg).*)'
  ]
}
