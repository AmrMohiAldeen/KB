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
  const numericColumns = new Set(['articleCount', 'sortOrder', 'depth'])

  if (numericColumns.has(sort.columnId)) {
    const aValue = Number(a[sort.columnId as keyof FlatCategory] ?? 0)
    const bValue = Number(b[sort.columnId as keyof FlatCategory] ?? 0)

    return (aValue - bValue) * direction
  }

  const aValue = String(a[sort.columnId as keyof FlatCategory] ?? '')
  const bValue = String(b[sort.columnId as keyof FlatCategory] ?? '')

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
        ? `${category.name} ${category.description} ${category.slug} ${category.parentName}`.toLowerCase().includes(needle)
        : true
    )
    .sort(compareCategories(sort))
}
