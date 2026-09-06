export type TranslationStatus = 'Original' | 'NeedsTranslation' | 'NeedsVerification' | 'Verified' | 'OutOfDate'
export type TranslationMethod = 'Original' | 'Manual' | 'Automatic' | 'LinkedExisting' | 'Copied'

export type LanguageResponse = { languageId: string; localeCode: string; displayName: string; nativeName: string; isDefault: boolean; isEnabled: boolean; isRtl: boolean; sortOrder: number }
export type TranslationLanguageResponse = Pick<LanguageResponse, 'localeCode' | 'displayName' | 'nativeName' | 'isRtl'>
export type ArticleTranslationResponse = { articleId: string; translationGroupId: string; localeCode: string; title: string; slug: string; workflowStatus: string; translationStatus: TranslationStatus; translationMethod: TranslationMethod; sourceArticleId: string | null; sourceVersionId: string | null; sourceVersionNumber: number | null; assignedTranslatorUserId: string | null; lastTranslatedAt: string | null; verifiedAt: string | null; verifiedByUserId: string | null; currentSourceVersionId: string | null; currentSourceVersionNumber: number | null; isCurrent: boolean | null }
export type CreateArticleTranslationRequest = { localeCode: string; title: string; categoryId: string; categoryIds?: string[]; slug?: string; visibility?: 'Public' | 'Internal'; assignedTranslatorUserId?: string | null }
export type LocalizationSyncScope = 'MissingOnly' | 'UpdateExisting'
export type LocalizationSyncMode = 'CopySource' | 'AutomaticTranslation'
export type LocalizationSyncRequest = { targetLocaleCodes: string[]; scope: LocalizationSyncScope; mode: LocalizationSyncMode }
export type LocalizationSyncPreviewItem = { targetLocaleCode: string; targetArticleId: string | null; state: 'Missing' | 'Current' | 'OutOfDate'; operation: 'Skip' | 'CreateCopy' | 'CreateAutomaticTranslation' | 'UpdateCopy' | 'UpdateAutomaticTranslation'; mayReplaceManualDraftContent: boolean }
export type LocalizationSyncPreview = { sourceArticleId: string; sourceLocaleCode: string; sourceVersionId: string | null; sourceVersionNumber: number | null; scope: LocalizationSyncScope; mode: LocalizationSyncMode; items: LocalizationSyncPreviewItem[] }
export type LocalizationSyncOutcome = { targetLocaleCode: string; targetArticleId: string | null; operation: LocalizationSyncPreviewItem['operation']; outcome: 'Skipped' | 'Succeeded' | 'Failed'; targetDraftId: string | null; translationStatus: TranslationStatus | null; error: string | null }
export type LocalizationSyncResult = { sourceArticleId: string; sourceVersionId: string | null; sourceVersionNumber: number | null; outcomes: LocalizationSyncOutcome[] }
