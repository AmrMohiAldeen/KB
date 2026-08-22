export type ProblemDetails = {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  traceId?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  readonly status: number
  readonly problem?: ProblemDetails

  constructor(status: number, problem?: ProblemDetails) {
    super(problem?.detail || problem?.title || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }

  get validationMessages(): string[] {
    return Object.values(this.problem?.errors ?? {}).flat()
  }
}

const defaultProblem = (status: number): ProblemDetails => {
  const messages: Record<number, Pick<ProblemDetails, 'title' | 'detail'>> = {
    400: { title: 'Bad request', detail: 'The request could not be processed. Review the submitted values.' },
    401: { title: 'Unauthorized', detail: 'Your session has expired or the access token is invalid.' },
    403: { title: 'Forbidden', detail: 'You do not have permission to perform this action.' },
    404: { title: 'Not found', detail: 'The requested resource was not found.' },
    409: { title: 'Conflict', detail: 'The resource changed or conflicts with an existing resource.' },
    500: { title: 'Server error', detail: 'The server could not complete the request. Try again later.' },
    503: { title: 'Service unavailable', detail: 'A required service is temporarily unavailable. Try again later.' }
  }

  return { status, ...(messages[status] ?? { title: 'Request failed', detail: `Request failed with status ${status}.` }) }
}

export const getApiBaseUrl = () => {
  const value = process.env.NEXT_PUBLIC_KB_API_BASE_URL?.replace(/\/+$/, '')

  if (!value)
    throw new Error('NEXT_PUBLIC_KB_API_BASE_URL is not configured.')

  return value
}

export const normalizeAccessToken = (accessToken: string): string =>
  accessToken.trim().replace(/^Bearer\s+/i, '')

export const hasAccessToken = (accessToken: string): boolean => Boolean(normalizeAccessToken(accessToken))

export const isAuthenticationError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const token = normalizeAccessToken(accessToken)

  if (!token)
    throw new ApiError(401, {
      status: 401,
      title: 'Unauthorized',
      detail: 'Authentication is required.'
    })

  const headers = new Headers(init.headers)

  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${token}`)

  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json')

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      cache: 'no-store',
      headers
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error

    throw new ApiError(0, {
      status: 0,
      title: 'Network error',
      detail: 'The knowledge base API could not be reached. Check your connection and API configuration.'
    })
  }

  if (response.status === 204)
    return undefined as T

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('/json') || contentType.includes('+json')
  let body: unknown

  if (isJson) {
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
  }

  if (!response.ok)
    throw new ApiError(response.status, (body as ProblemDetails | undefined) ?? defaultProblem(response.status))

  return body as T
}

export async function publicApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, cache: 'no-store', headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, { status: 0, title: 'Network error', detail: 'The knowledge base API could not be reached.' })
  }

  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('json') ? await response.json().catch(() => undefined) : undefined
  if (!response.ok) throw new ApiError(response.status, (body as ProblemDetails | undefined) ?? defaultProblem(response.status))
  return body as T
}

export async function viewerApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  headers.set('Accept', 'application/json')
  if (init.body) headers.set('Content-Type', 'application/json')

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, { status: 0, title: 'Network error', detail: 'The Viewer knowledge base API could not be reached.' })
  }

  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('json') ? await response.json().catch(() => undefined) : undefined
  if (!response.ok) throw new ApiError(response.status, (body as ProblemDetails | undefined) ?? defaultProblem(response.status))
  return body as T
}

export async function apiBlobRequest(
  path: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Blob> {
  const token = normalizeAccessToken(accessToken)

  if (!token)
    throw new ApiError(401, {
      status: 401,
      title: 'Unauthorized',
      detail: 'Authentication is required.'
    })

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      headers: {
        Accept: '*/*',
        Authorization: `Bearer ${token}`
      },
      signal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error

    throw new ApiError(0, {
      status: 0,
      title: 'Network error',
      detail: 'The knowledge base API could not be reached. Check your connection and API configuration.'
    })
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    let problem: ProblemDetails | undefined

    if (contentType.includes('/json') || contentType.includes('+json')) {
      try {
        problem = await response.json() as ProblemDetails
      } catch {
        problem = undefined
      }
    }

    throw new ApiError(response.status, problem ?? defaultProblem(response.status))
  }

  return response.blob()
}

export async function viewerBlobRequest(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: '*/*' },
      signal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, { status: 0, title: 'Network error', detail: 'The Viewer image could not be reached.' })
  }
  if (!response.ok) throw new ApiError(response.status, defaultProblem(response.status))
  return response.blob()
}

export const describeApiError = (error: unknown): string[] => {
  if (!(error instanceof ApiError))
    return [error instanceof Error ? error.message : 'An unexpected error occurred.']

  if (error.validationMessages.length)
    return error.validationMessages

  const withTraceId = (message: string) => error.problem?.traceId
    ? `${message} (Reference: ${error.problem.traceId})`
    : message

  switch (error.status) {
    case 0:
      return ['The knowledge base API could not be reached. Check your connection and try again.']
    case 401:
      return ['Your session has expired or the access token is invalid. Sign in again.']
    case 403:
      return ['You do not have permission to perform this action.']
    case 404:
      return [error.message || 'The requested resource no longer exists. Refresh the page.']
    case 409:
      return [error.message || 'The resource changed or conflicts with an existing resource. Refresh and try again.']
    case 500:
      return [withTraceId(error.message || 'The server could not complete the request. Try again later.')]
    default:
      return [withTraceId(error.message)]
  }
}
