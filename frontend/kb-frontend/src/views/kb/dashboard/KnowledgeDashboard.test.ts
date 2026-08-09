import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getCategoryTree } from '@/lib/api/categories'
import { getDashboardItems, getDashboardPermissionContext } from '@/lib/api/dashboardApi'
import KnowledgeDashboard from './KnowledgeDashboard'

vi.mock('next/navigation', () => ({
  useParams: () => ({ lang: 'en' }),
  useRouter: () => ({ push: vi.fn() })
}))

vi.mock('@/lib/api/categories', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/api/categories')>(),
  getCategoryTree: vi.fn()
}))

vi.mock('@/lib/api/dashboardApi', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/api/dashboardApi')>(),
  getDashboardItems: vi.fn(),
  getDashboardPermissionContext: vi.fn()
}))

describe('KnowledgeDashboard loading', () => {
  const theme = createTheme({ cssVariables: true })
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)

    vi.mocked(getCategoryTree).mockResolvedValue([])
    vi.mocked(getDashboardPermissionContext).mockResolvedValue({ userId: 'user-1', permissions: [] })
    vi.mocked(getDashboardItems).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      totalCount: 0,
      articleCount: 0,
      everythingArticleCount: 0,
      filterCounts: {
        Everything: 0,
        Published: 0,
        DraftUnpublished: 0,
        ToReview: 0,
        Archived: 0
      },
      truncated: false
    })
  })

  afterEach(() => act(() => root.unmount()))

  it('stays loaded after the initial empty search debounce expires', async () => {
    await act(async () => {
      root.render(createElement(
        ThemeProvider,
        { theme },
        createElement(KnowledgeDashboard, { accessToken: 'token' })
      ))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.querySelector('[aria-label="Loading dashboard content"]')).toBeNull()

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 350))
    })

    expect(document.querySelector('[aria-label="Loading dashboard content"]')).toBeNull()
    expect(getDashboardItems).toHaveBeenCalledTimes(1)
    expect(getDashboardItems).toHaveBeenCalledWith(expect.objectContaining({ categoryId: undefined }))
  })
})
