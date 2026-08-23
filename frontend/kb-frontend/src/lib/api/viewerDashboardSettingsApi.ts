import { apiRequest } from './http'

export type ViewerDashboardAppearance = {
  primaryColor: string
  pageBackgroundColor: string
  categoryCardBackgroundColor: string
  textColor: string
}

export const getViewerDashboardAppearance = (accessToken: string, signal?: AbortSignal) =>
  apiRequest<ViewerDashboardAppearance>('/api/viewer-dashboard-settings', accessToken, { signal })

export const updateViewerDashboardAppearance = (appearance: ViewerDashboardAppearance, accessToken: string) =>
  apiRequest<ViewerDashboardAppearance>('/api/viewer-dashboard-settings', accessToken, {
    method: 'PUT',
    body: JSON.stringify(appearance)
  })
