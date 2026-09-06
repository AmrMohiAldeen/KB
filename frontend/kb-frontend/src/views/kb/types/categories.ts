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
  status?: 'Active' | 'Archived'
  visibility?: 'Public' | 'Internal'
  viewerImageMediaId?: string | null
  viewerIcon?: string | null
  localizations?: Array<{ localeCode: string; name: string; description: string | null }>
  children: KbCategoryNode[]
}
