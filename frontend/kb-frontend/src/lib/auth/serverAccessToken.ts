import { cookies, headers } from 'next/headers'

const bearerToken = (value: string | null): string => value?.trim().replace(/^Bearer\s+/i, '') ?? ''

/** Retrieves the access token supplied by the host SSO/session integration. */
export async function getServerAccessToken(): Promise<string> {
  const authorization = bearerToken((await headers()).get('authorization'))

  if (authorization) return authorization

  const store = await cookies()
  return bearerToken(store.get('kb_access_token')?.value ?? null)
}
