import ViewerDashboardSettingsPage from '@/views/kb/viewer-dashboard-settings/ViewerDashboardSettingsPage'

export default async function ViewerDashboardSettingsRoute() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN
  if (!accessToken) throw new Error('KB_DEV_ACCESS_TOKEN is not set')
  return <ViewerDashboardSettingsPage accessToken={accessToken} />
}
