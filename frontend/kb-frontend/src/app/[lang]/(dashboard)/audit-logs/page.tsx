// View Imports
import AuditActivityFeed from '@/views/kb/audit/AuditActivityFeed'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function AuditLogsPage() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <AuditActivityFeed accessToken={accessToken} />
}

