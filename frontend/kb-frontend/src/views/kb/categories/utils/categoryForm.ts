// Type Imports
import type { KbCategoryNode } from '../../types/categories'

export type CategoryFormState = {
  name: string
  description: string
  parentCategoryId: string
  sortOrder: number
}

export const emptyCategoryForm: CategoryFormState = {
  name: '',
  description: '',
  parentCategoryId: '',
  sortOrder: 0
}

export const getInitialCategoryForm = (category?: KbCategoryNode): CategoryFormState =>
  category
    ? {
        name: category.name,
        description: category.description,
        parentCategoryId: category.parentId ?? '',
        sortOrder: category.sortOrder
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
