import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import NotificationsPage from '@/views/kb/notifications/NotificationsPage'

export default async function NotificationsRoute() {
  const accessToken = await getServerAccessToken()
  return <NotificationsPage accessToken={accessToken} />
}
