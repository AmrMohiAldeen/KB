import { apiRequest } from './http'
import type { ArticleTranslationResponse, CreateArticleTranslationRequest, LocalizationSyncPreview, LocalizationSyncRequest, LocalizationSyncResult, TranslationLanguageResponse } from '@/types/apps/translationTypes'

const path = (articleId: string) => `/api/articles/${encodeURIComponent(articleId)}/translations`
export const getTranslationLanguages = (accessToken: string, signal?: AbortSignal) => apiRequest<TranslationLanguageResponse[]>('/api/languages/translation-targets', accessToken, { signal })
export const getArticleTranslations = (articleId: string, accessToken: string, signal?: AbortSignal) => apiRequest<ArticleTranslationResponse[]>(path(articleId), accessToken, { signal })
export const createArticleTranslation = (articleId: string, request: CreateArticleTranslationRequest, accessToken: string) => apiRequest<ArticleTranslationResponse>(path(articleId), accessToken, { method: 'POST', body: JSON.stringify(request) })
export const linkArticleTranslation = (articleId: string, targetArticleId: string, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/link`, accessToken, { method: 'POST', body: JSON.stringify({ articleId: targetArticleId }) })
export const unlinkArticleTranslation = (articleId: string, accessToken: string) => apiRequest<void>(`${path(articleId)}/unlink`, accessToken, { method: 'POST' })
export const verifyArticleTranslation = (articleId: string, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/verify`, accessToken, { method: 'POST' })
export const assignArticleTranslator = (articleId: string, translatorUserId: string | null, accessToken: string) => apiRequest<ArticleTranslationResponse>(`${path(articleId)}/translator`, accessToken, { method: 'PUT', body: JSON.stringify({ translatorUserId }) })
export const previewLocalizationSync = (articleId: string, request: LocalizationSyncRequest, accessToken: string) => apiRequest<LocalizationSyncPreview>(`${path(articleId)}/sync/preview`, accessToken, { method: 'POST', body: JSON.stringify(request) })
export const synchronizeLocalizations = (articleId: string, request: LocalizationSyncRequest, accessToken: string) => apiRequest<LocalizationSyncResult>(`${path(articleId)}/sync`, accessToken, { method: 'POST', body: JSON.stringify(request) })
