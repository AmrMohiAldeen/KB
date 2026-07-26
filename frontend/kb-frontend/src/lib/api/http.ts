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
    500: { title: 'Server error', detail: 'The server could not complete the request. Try again later.' }
  }

  return { status, ...(messages[status] ?? { title: 'Request failed', detail: `Request failed with status ${status}.` }) }
}

const getApiBaseUrl = () => {
  const value = process.env.NEXT_PUBLIC_KB_API_BASE_URL?.replace(/\/+$/, '')

  if (!value)
    throw new Error('NEXT_PUBLIC_KB_API_BASE_URL is not configured.')

  return value
}

export const normalizeAccessToken = (accessToken: string): string =>
  accessToken.trim().replace(/^Bearer\s+/i, '')

export const hasAccessToken = (accessToken: string): boolean => Boolean(normalizeAccessToken(accessToken))

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

  if (init.body)
    headers.set('Content-Type', 'application/json')

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
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

export const describeApiError = (error: unknown): string[] => {
  if (!(error instanceof ApiError))
    return [error instanceof Error ? error.message : 'An unexpected error occurred.']

  if (error.validationMessages.length)
    return error.validationMessages

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
      return ['The server could not complete the request. Try again later.']
    default:
      return [error.message]
  }
}
