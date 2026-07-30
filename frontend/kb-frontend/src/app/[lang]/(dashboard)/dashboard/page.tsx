import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import KnowledgeDashboard from '@/views/kb/dashboard/KnowledgeDashboard'

export default async function DashboardPage() {
  const accessToken = await getServerAccessToken()

  return <KnowledgeDashboard accessToken={accessToken} />
}
