import MediaLibraryPage from '@/views/kb/media/MediaLibraryPage'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function MediaPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const accessToken = await getServerAccessToken()

  return <MediaLibraryPage accessToken={accessToken} locale={lang} />
}
