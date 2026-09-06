// Type Imports
import type { KbCategoryNode } from '../../types/categories'

export type CategoryFormState = {
  name: string
  slug: string
  description: string
  parentCategoryId: string
  sortOrder: number
  visibility: 'Public' | 'Internal'
  viewerImageMediaId: string
  viewerIcon: string
  localizations: Array<{ localeCode: string; name: string; description: string }>
}

export const emptyCategoryForm: CategoryFormState = {
  name: '',
  slug: '',
  description: '',
  parentCategoryId: '',
  sortOrder: 0,
  visibility: 'Public',
  viewerImageMediaId: '',
  viewerIcon: 'folder',
  localizations: []
}

export const getInitialCategoryForm = (category?: KbCategoryNode): CategoryFormState =>
  category
    ? {
        name: category.name,
        slug: category.slug,
        description: category.description,
        parentCategoryId: category.parentId ?? '',
        sortOrder: category.sortOrder,
        visibility: category.visibility ?? 'Public',
        viewerImageMediaId: category.viewerImageMediaId ?? '',
        viewerIcon: category.viewerIcon ?? (category.viewerImageMediaId ? '' : 'folder'),
        localizations: (category.localizations ?? []).map(localization => ({
          localeCode: localization.localeCode, name: localization.name, description: localization.description ?? ''
        }))
      }
    : emptyCategoryForm

const flattenCategoryNodes = (categories: KbCategoryNode[]): KbCategoryNode[] =>
  categories.flatMap(category => [category, ...(category.children ? flattenCategoryNodes(category.children) : [])])

const collectDescendantIds = (category: KbCategoryNode | undefined): Set<string> =>
  new Set(category ? flattenCategoryNodes(category.children).map(child => child.id) : [])
export const getCategoryOptions = (categories: KbCategoryNode[], category?: KbCategoryNode) => {
  const excludedIds = collectDescendantIds(category)

  if (category)
    excludedIds.add(category.id)

  return flattenCategoryNodes(categories).filter(option => !excludedIds.has(option.id))
}
