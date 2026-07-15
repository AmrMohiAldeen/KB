export type KbCategoryNode = {
  id: string
  name: string
  description: string
  slug: string
  parentId: string | null
  sortOrder: number
  path: string | null
  depth: number
  articleCount: number
  children: KbCategoryNode[]
}
