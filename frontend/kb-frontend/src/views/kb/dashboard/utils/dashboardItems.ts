import type { ArticleListItemResponse } from '@/types/apps/articleTypes'
import type { DashboardItem, DashboardSort } from '@/types/apps/dashboardTypes'
import type { KbCategoryNode } from '../../types/categories'

export const flattenDashboardCategories = (categories: KbCategoryNode[]): KbCategoryNode[] =>
  categories.flatMap(category => [
    category,
    ...flattenDashboardCategories(category.children ?? [])
  ])

const itemTitle = (item: DashboardItem) =>
  item.kind === 'category' ? item.category.name : item.article.title

const itemDate = (item: DashboardItem, field: 'createdAt' | 'updatedAt') =>
  item.kind === 'article' ? new Date(item.article[field]).getTime() : Number.NEGATIVE_INFINITY

export const buildDashboardItems = ({
  categories,
  articles,
  search,
  sort
}: {
  categories: KbCategoryNode[]
  articles: ArticleListItemResponse[]
  search: string
  sort: DashboardSort
}): DashboardItem[] => {
  const needle = search.trim().toLocaleLowerCase()
  const categoryItems: DashboardItem[] = flattenDashboardCategories(categories)
    .filter(category => !needle || category.name.toLocaleLowerCase().includes(needle))
    .map(category => ({ kind: 'category', id: `category:${category.id}`, category }))
  const articleItems: DashboardItem[] = articles
    .filter(article => !needle || article.title.toLocaleLowerCase().includes(needle))
    .map(article => ({ kind: 'article', id: `article:${article.articleId}`, article }))
  const items = [...categoryItems, ...articleItems]

  return items.sort((left, right) => {
    if (sort === 'title')
      return itemTitle(left).localeCompare(itemTitle(right))

    if (sort === 'createdAt' || sort === 'updatedAt')
      return itemDate(right, sort) - itemDate(left, sort) || itemTitle(left).localeCompare(itemTitle(right))

    if (left.kind !== right.kind) return left.kind === 'category' ? -1 : 1
    if (left.kind === 'category' && right.kind === 'category')
      return left.category.sortOrder - right.category.sortOrder || left.category.name.localeCompare(right.category.name)

    // TODO(backend): expose article position in a combined dashboard response.
    return itemTitle(left).localeCompare(itemTitle(right))
  })
}

export const canEditDashboardArticle = ({
  article,
  permissionContext
}: {
  article: ArticleListItemResponse
  permissionContext: { userId: string; permissions: string[] } | null
}) => Boolean(
  permissionContext?.permissions.includes('articles.editAnyDraft') ||
  (
    permissionContext?.userId === article.owner.userId &&
    permissionContext.permissions.includes('articles.editOwnDraft')
  )
)
