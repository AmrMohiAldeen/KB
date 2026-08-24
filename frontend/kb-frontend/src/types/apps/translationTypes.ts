export type TranslationStatus = 'Original' | 'NeedsTranslation' | 'NeedsVerification' | 'Verified' | 'OutOfDate'
export type TranslationMethod = 'Original' | 'Manual' | 'Automatic' | 'LinkedExisting' | 'Copied'

export type LanguageResponse = { languageId: string; localeCode: string; displayName: string; nativeName: string; isDefault: boolean; isEnabled: boolean; isRtl: boolean; sortOrder: number }
export type ArticleTranslationResponse = { articleId: string; translationGroupId: string; localeCode: string; title: string; slug: string; workflowStatus: string; translationStatus: TranslationStatus; translationMethod: TranslationMethod; sourceArticleId: string | null; sourceVersionId: string | null; sourceVersionNumber: number | null; assignedTranslatorUserId: string | null; lastTranslatedAt: string | null; verifiedAt: string | null; verifiedByUserId: string | null }
export type CreateArticleTranslationRequest = { localeCode: string; title: string; categoryId: string; categoryIds?: string[]; slug?: string; visibility?: 'Public' | 'Internal'; assignedTranslatorUserId?: string | null }
