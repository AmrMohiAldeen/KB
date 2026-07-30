import { describe, expect, it } from 'vitest'

import type { ArticleListItemResponse } from '@/types/apps/articleTypes'
import type { KbCategoryNode } from '../../types/categories'
import { buildDashboardItems, canEditDashboardArticle, flattenDashboardCategories } from './dashboardItems'

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
  lockedBy: null
}

describe('dashboard items', () => {
  it('flattens nested navigation categories in tree order', () => {
    const child = category('child', 'Child', 0)
    const root = category('root', 'Root', 0, [child])

    expect(flattenDashboardCategories([root]).map(item => item.id)).toEqual(['root', 'child'])
  })

  it('combines category and article matches and sorts them by title', () => {
    const items = buildDashboardItems({
      categories: [category('category-1', 'Alpha category', 0)],
      articles: [article],
      search: '',
      sort: 'title'
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
