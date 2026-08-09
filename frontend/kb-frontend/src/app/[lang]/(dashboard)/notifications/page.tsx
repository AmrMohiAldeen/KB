import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import NotificationsPage from '@/views/kb/notifications/NotificationsPage'

export default async function NotificationsRoute() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }

  return <NotificationsPage accessToken={accessToken} />
}
