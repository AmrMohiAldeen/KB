import { apiRequest } from './http'
import type { ArticleTranslationResponse, CreateArticleTranslationRequest, LanguageResponse } from '@/types/apps/translationTypes'

const path = (articleId: string) => `/api/articles/${encodeURIComponent(articleId)}/translations`
export const getLanguages = (accessToken: string, signal?: AbortSignal) => apiRequest<LanguageResponse[]>('/api/languages', accessToken, { signal })
export const getArticleTranslations = (articleId: string, accessToken: string, signal?: AbortSignal) => apiRequest<ArticleTranslationResponse[]>(path(articleId), accessToken, { signal })
export const createArticleTranslation = (articleId: string, request: CreateArticleTranslationRequest, accessToken: string) => apiRequest<ArticleTranslationResponse>(path(articleId), accessToken, { method: 'POST', body: JSON.stringify(request) })
export const linkArticleTranslation = (articleId: string, targetArticleId: string, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/link`, accessToken, { method: 'POST', body: JSON.stringify({ articleId: targetArticleId }) })
export const unlinkArticleTranslation = (articleId: string, accessToken: string) => apiRequest<void>(`${path(articleId)}/unlink`, accessToken, { method: 'POST' })
export const verifyArticleTranslation = (articleId: string, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/verify`, accessToken, { method: 'POST' })
export const assignArticleTranslator = (articleId: string, translatorUserId: string | null, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/translator`, accessToken, { method: 'PUT', body: JSON.stringify({ translatorUserId }) })
