import HelpJuiceMigrationPage from '@/views/kb/migration/helpjuice/HelpJuiceMigrationPage'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function HelpJuiceMigrationRoutePage() {
  const accessToken = await getServerAccessToken()
  return <HelpJuiceMigrationPage accessToken={accessToken} />
}
