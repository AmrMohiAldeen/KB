// View Imports
import AuditActivityFeed from '@/views/kb/audit/AuditActivityFeed'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function AuditLogsPage() {
  const accessToken = await getServerAccessToken()

  return <AuditActivityFeed accessToken={accessToken} />
}

