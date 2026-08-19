import { cookies, headers } from 'next/headers'

export const INTERNAL_PREVIEW_COOKIE_NAME = 'kb_internal_preview'

const bearerToken = (value: string | null): string => value?.trim().replace(/^Bearer\s+/i, '') ?? ''

/** Retrieves the access token supplied by the host SSO/session integration. */
export async function getServerAccessToken(): Promise<string> {
  const authorization = bearerToken((await headers()).get('authorization'))

  if (authorization) return authorization

  const store = await cookies()
  return bearerToken(store.get('kb_access_token')?.value ?? null)
}

/** Retrieves the internal JWT persisted by the authenticated preview handoff. */
export async function getInternalPreviewAccessToken(): Promise<string> {
  const store = await cookies()
  return bearerToken(store.get(INTERNAL_PREVIEW_COOKIE_NAME)?.value ?? null)
}
