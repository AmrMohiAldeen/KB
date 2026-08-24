import { apiRequest } from './http'

export type ViewerDashboardAppearance = {
  primaryColor: string
  pageBackgroundColor: string
  categoryCardBackgroundColor: string
  textColor: string
}

export type ViewerDashboardCategoryCustomization = {
  categoryId: string
  sortOrder: number
  viewerImageMediaId: string | null
  viewerIcon: string | null
  displayColor: string
}

export type ViewerDashboardCustomization = {
  rootCategoryId: string
  appearance: ViewerDashboardAppearance
  categories: ViewerDashboardCategoryCustomization[]
}

export const getViewerDashboardAppearance = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerDashboardAppearance>('/api/viewer-dashboard-settings', accessToken, { signal })

export const updateViewerDashboardAppearance = (appearance: ViewerDashboardAppearance, accessToken: string) =>
  apiRequest<ViewerDashboardAppearance>('/api/viewer-dashboard-settings', accessToken, {
    method: 'PUT',
    body: JSON.stringify(appearance)
  })

export const getViewerDashboardCustomization = (rootCategoryId: string, accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerDashboardCustomization>(`/api/viewer-dashboard-settings/${encodeURIComponent(rootCategoryId)}`, accessToken, { signal })

export const updateViewerDashboardCustomization = (customization: ViewerDashboardCustomization, accessToken: string) =>
  apiRequest<ViewerDashboardCustomization>(`/api/viewer-dashboard-settings/${encodeURIComponent(customization.rootCategoryId)}`, accessToken, {
    method: 'PUT', body: JSON.stringify({ appearance: customization.appearance, categories: customization.categories })
  })
