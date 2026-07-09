// Type Imports
import type { KbDataTableSort } from '@/views/shared/tables/KbDataTable'
import type { KbCategoryNode } from '../../types/categories'

export type FlatCategory = KbCategoryNode & {
  depth: number
  parentName: string
}

const flattenCategories = (categories: KbCategoryNode[], parentName = 'Top level', depth = 0): FlatCategory[] =>
  categories.flatMap(category => [
    { ...category, depth, parentName },
    ...(category.children ? flattenCategories(category.children, category.name, depth + 1) : [])
  ])

const compareCategories = (sort: KbDataTableSort) => (a: FlatCategory, b: FlatCategory) => {
  const direction = sort.direction === 'asc' ? 1 : -1
  const aValue = sort.columnId === 'updatedAt' ? a.updatedAt : String(a[sort.columnId as keyof FlatCategory] ?? '')
  const bValue = sort.columnId === 'updatedAt' ? b.updatedAt : String(b[sort.columnId as keyof FlatCategory] ?? '')

  if (sort.columnId === 'updatedAt') {
    return (new Date(aValue).getTime() - new Date(bValue).getTime()) * direction
  }

  return String(aValue).localeCompare(String(bValue)) * direction
}

export const getVisibleCategories = ({
  categories,
  search,
  sort
}: {
  categories: KbCategoryNode[]
  search: string
  sort: KbDataTableSort
}) => {
  const needle = search.trim().toLowerCase()

  return flattenCategories(categories)
    .filter(category =>
      needle
        ? `${category.name} ${category.subtitle} ${category.slug} ${category.parentName}`.toLowerCase().includes(needle)
        : true
    )
    .sort(compareCategories(sort))
}
