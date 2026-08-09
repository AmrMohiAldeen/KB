import MediaLibraryPage from '@/views/kb/media/MediaLibraryPage'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function MediaPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <MediaLibraryPage accessToken={accessToken} locale={lang} />
}
