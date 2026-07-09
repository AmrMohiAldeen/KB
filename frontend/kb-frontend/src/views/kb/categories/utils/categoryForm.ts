// Type Imports
import type { KbCategoryNode } from '../../types/categories'

export type CategoryFormState = {
  name: string
  subtitle: string
  slug: string
  parentId: string
}

export const emptyCategoryForm: CategoryFormState = {
  name: '',
  subtitle: '',
  slug: '',
  parentId: ''
}

export const getInitialCategoryForm = (category?: KbCategoryNode): CategoryFormState =>
  category
    ? {
        name: category.name,
        subtitle: category.subtitle,
        slug: category.slug,
        parentId: category.parentId ?? ''
      }
    : emptyCategoryForm

const flattenCategoryNodes = (categories: KbCategoryNode[]): KbCategoryNode[] =>
  categories.flatMap(category => [category, ...(category.children ? flattenCategoryNodes(category.children) : [])])

export const getCategoryOptions = (categories: KbCategoryNode[], category?: KbCategoryNode) =>
  flattenCategoryNodes(categories).filter(option => option.id !== category?.id)

export const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
