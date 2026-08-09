import { describe, expect, it } from 'vitest'

import type { ArticleListItemResponse } from '@/types/apps/articleTypes'
import type { KbCategoryNode } from '../../types/categories'
import {
  buildDashboardItems,
  canEditDashboardArticle,
  flattenDashboardCategories,
  getDashboardCategoriesForSelection
} from './dashboardItems'

const category = (
  id: string,
  name: string,
  sortOrder: number,
  children: KbCategoryNode[] = []
): KbCategoryNode => ({
  id,
  name,
  sortOrder,
  children,
  description: '',
  slug: name.toLowerCase(),
  parentId: null,
  path: null,
  depth: 0,
  articleCount: 0
})

const article: ArticleListItemResponse = {
  articleId: 'article-1',
  title: 'Beta article',
  slug: 'beta-article',
  status: 'Draft',
  category: null,
  owner: { userId: 'owner-1', fullName: 'Owner One' },
  currentDraftId: 'draft-1',
  currentPublishedVersionId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  publishedAt: null,
  isCurrentDraftLocked: false,
  lockedBy: null,
  position: 4
}

describe('dashboard items', () => {
  it('flattens nested navigation categories in tree order', () => {
    const child = category('child', 'Child', 0)
    const root = category('root', 'Root', 0, [child])

    expect(flattenDashboardCategories([root]).map(item => item.id)).toEqual(['root', 'child'])
  })

  it('returns only the immediate children of the selected category', () => {
    const grandchild = category('grandchild', 'Grandchild', 0)
    const child = category('child', 'Child', 0, [grandchild])
    const root = category('root', 'Root', 0, [child])

    expect(getDashboardCategoriesForSelection([root], 'root').map(item => item.id)).toEqual(['child'])
    expect(getDashboardCategoriesForSelection([root], 'child').map(item => item.id)).toEqual(['grandchild'])
    expect(getDashboardCategoriesForSelection([root], 'missing')).toEqual([])
  })

  it('can keep a selected category view limited to immediate children', () => {
    const grandchild = category('grandchild', 'Grandchild', 0)
    const child = category('child', 'Child', 0, [grandchild])

    const items = buildDashboardItems({
      categories: [child],
      articles: [],
      search: '',
      sort: 'position',
      includeCategoryDescendants: false
    })

    expect(items.map(item => item.id)).toEqual(['category:child'])
  })

  it('combines category and article matches and sorts them by title', () => {
    const items = buildDashboardItems({
      categories: [category('category-1', 'Zulu category', 0)],
      articles: [article],
      search: '',
      sort: 'title'
    })

    expect(items.map(item => item.id)).toEqual(['category:category-1', 'article:article-1'])
  })

  it('keeps categories before articles for date sorting', () => {
    const items = buildDashboardItems({
      categories: [category('category-1', 'Category', 0)],
      articles: [article],
      search: '',
      sort: 'updatedAt'
    })

    expect(items.map(item => item.id)).toEqual(['category:category-1', 'article:article-1'])
  })

  it('matches search against category and article names only', () => {
    const items = buildDashboardItems({
      categories: [category('category-1', 'Alpha category', 0)],
      articles: [article],
      search: 'beta',
      sort: 'position'
    })

    expect(items.map(item => item.id)).toEqual(['article:article-1'])
  })

  it('uses backend article positions for position sorting', () => {
    const earlier = { ...article, articleId: 'article-2', title: 'Zulu', position: 1 }

    const items = buildDashboardItems({
      categories: [],
      articles: [article, earlier],
      search: '',
      sort: 'position'
    })

    expect(items.map(item => item.id)).toEqual(['article:article-2', 'article:article-1'])
  })

  it('applies own and any-draft permissions without category scoping', () => {
    expect(canEditDashboardArticle({
      article,
      permissionContext: { userId: 'owner-1', permissions: ['articles.editOwnDraft'] }
    })).toBe(true)
    expect(canEditDashboardArticle({
      article,
      permissionContext: { userId: 'someone-else', permissions: ['articles.editOwnDraft'] }
    })).toBe(false)
    expect(canEditDashboardArticle({
      article,
      permissionContext: { userId: 'someone-else', permissions: ['articles.editAnyDraft'] }
    })).toBe(true)
  })
})
