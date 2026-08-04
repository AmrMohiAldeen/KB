// View Imports
import PublicArticleViewerPage from '@/views/kb/public/PublicArticleViewerPage'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function KbArticlePage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  const accessToken = await getServerAccessToken()

  return <PublicArticleViewerPage lang={lang} slug={slug} accessToken={accessToken} />
}
