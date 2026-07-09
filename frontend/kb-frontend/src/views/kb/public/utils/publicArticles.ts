// Type Imports
import type { KbCategoryNode } from '../../types/categories'
import type { PublicArticleSummary } from '../../types/public'

export const getVisiblePublicArticles = (articles: PublicArticleSummary[], search: string) => {
  const needle = search.trim().toLowerCase()

  return articles.filter(article =>
    needle ? `${article.title} ${article.categoryPath}`.toLowerCase().includes(needle) : true
  )
}

export const getPopularPublicArticles = (articles: PublicArticleSummary[]) =>
  articles.toSorted((a, b) => b.views - a.views).slice(0, 6)

export const getCategoryArticles = (articles: PublicArticleSummary[], category: KbCategoryNode) =>
  articles.filter(article => article.categoryPath.toLowerCase().includes(category.name.toLowerCase()))
