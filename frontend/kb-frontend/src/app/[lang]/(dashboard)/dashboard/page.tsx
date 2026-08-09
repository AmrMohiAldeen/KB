import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import KnowledgeDashboard from '@/views/kb/dashboard/KnowledgeDashboard'

export default async function DashboardPage() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <KnowledgeDashboard accessToken={accessToken} />
}
