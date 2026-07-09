export type KbCategoryNode = {
  id: string
  name: string
  subtitle: string
  slug: string
  parentId: string | null
  articleCount: number
  updatedAt: string
  children?: KbCategoryNode[]
}
