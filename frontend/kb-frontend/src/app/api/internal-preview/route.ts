import { NextResponse, type NextRequest } from 'next/server'

import { getApiBaseUrl, normalizeAccessToken } from '@/lib/api/http'
import { INTERNAL_PREVIEW_COOKIE_NAME } from '@/lib/auth/serverAccessToken'

const validCategorySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const errorResponse = (status: number, detail: string) => NextResponse.json({
  status,
  title: status === 401 ? 'Unauthorized' : status === 404 ? 'Not found' : 'Preview unavailable',
  detail
}, { status })

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const categorySlug = String(form.get('categorySlug') ?? '').trim().toLowerCase()
  const accessToken = normalizeAccessToken(String(form.get('accessToken') ?? ''))

  if (!accessToken)
    return errorResponse(401, 'An authenticated internal KB session is required.')

  if (!categorySlug || categorySlug.length > 250 || !validCategorySlug.test(categorySlug))
    return errorResponse(400, 'A valid category slug is required.')

  let validation: Response

  try {
    validation = await fetch(
      `${getApiBaseUrl()}/api/viewer/preview/${encodeURIComponent(categorySlug)}`,
      {
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        signal: request.signal
      }
    )
  } catch {
    return errorResponse(503, 'The knowledge base API could not validate the internal preview session.')
  }

  if (!validation.ok) {
    const status = [401, 403, 404].includes(validation.status) ? validation.status : 503
    return errorResponse(status, status === 401
      ? 'An authenticated internal KB session is required.'
      : status === 403
        ? 'The internal KB session is not authorized to preview categories.'
        : status === 404
          ? 'The preview category was not found.'
          : 'The knowledge base API could not validate the internal preview session.')
  }

  const response = NextResponse.redirect(new URL(`/${encodeURIComponent(categorySlug)}`, request.url), 303)
  response.cookies.set(INTERNAL_PREVIEW_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    priority: 'high'
  })
  return response
}
