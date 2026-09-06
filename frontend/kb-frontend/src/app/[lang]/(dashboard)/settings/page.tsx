// View Imports
import KbSettingsPage from '@/views/kb/settings/SettingsPage'

export default function SettingsPage() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('KB_DEV_ACCESS_TOKEN is not set')
  }

  return <KbSettingsPage accessToken={accessToken} />
}
