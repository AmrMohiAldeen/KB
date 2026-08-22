import HelpJuiceMigrationPage from '@/views/kb/migration/helpjuice/HelpJuiceMigrationPage'

export default async function HelpJuiceMigrationRoutePage() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('KB_DEV_ACCESS_TOKEN is not set')
  }

  return <HelpJuiceMigrationPage accessToken={accessToken} />
}
