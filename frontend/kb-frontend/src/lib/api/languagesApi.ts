import { apiRequest } from './http'
import type { LanguageResponse } from '@/types/apps/translationTypes'

export type CreateLanguageRequest = {
  localeCode: string
  displayName: string
  nativeName: string
  isRtl: boolean
  sortOrder: number
}

export const getLanguages = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<LanguageResponse[]>('/api/languages', accessToken, { signal })

export const createLanguage = (request: CreateLanguageRequest, accessToken: string) =>
  apiRequest<LanguageResponse>('/api/languages', accessToken, { method: 'POST', body: JSON.stringify(request) })

export const enableLanguage = (languageId: string, accessToken: string) =>
  apiRequest<LanguageResponse>(`/api/languages/${encodeURIComponent(languageId)}/enable`, accessToken, { method: 'POST' })

export const disableLanguage = (languageId: string, accessToken: string) =>
  apiRequest<LanguageResponse>(`/api/languages/${encodeURIComponent(languageId)}/disable`, accessToken, { method: 'POST' })

export const setDefaultLanguage = (languageId: string, accessToken: string) =>
  apiRequest<LanguageResponse>(`/api/languages/${encodeURIComponent(languageId)}/default`, accessToken, { method: 'POST' })
