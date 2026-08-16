export type ArticleAttribution = {
  owner?: { fullName: string } | null
  legacyAuthorName?: string | null
  legacyAuthorEmail?: string | null
  legacyAuthorExternalId?: string | null
}

export const UNKNOWN_HELPJUICE_AUTHOR = 'Unknown HelpJuice author'

export const isHistoricalHelpJuiceArticle = (article: ArticleAttribution) => Boolean(
  article.legacyAuthorName || article.legacyAuthorEmail || article.legacyAuthorExternalId
)

export const historicalHelpJuiceAuthor = (article: ArticleAttribution) => {
  if (!isHistoricalHelpJuiceArticle(article)) return undefined
  return article.legacyAuthorName || article.legacyAuthorEmail || UNKNOWN_HELPJUICE_AUTHOR
}

export const articleAuthor = (article: ArticleAttribution) =>
  historicalHelpJuiceAuthor(article) || article.owner?.fullName || 'Article author'
