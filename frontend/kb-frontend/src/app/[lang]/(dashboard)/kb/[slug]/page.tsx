// View Imports
import PublicArticleViewerPage from '@/views/kb/public/PublicArticleViewerPage'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function KbArticlePage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <PublicArticleViewerPage lang={lang} slug={slug} accessToken={accessToken} />
}
