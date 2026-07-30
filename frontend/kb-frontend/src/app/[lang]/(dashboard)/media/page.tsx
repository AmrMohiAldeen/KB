// View Imports
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import MediaLibraryPage from '@/views/kb/media/MediaLibraryPage'

export default async function MediaPage({ params }: { params: Promise<{ lang: string }> }) {
  const [{ lang }, accessToken] = await Promise.all([params, getServerAccessToken()])

  return <MediaLibraryPage accessToken={accessToken} locale={lang} />
}
