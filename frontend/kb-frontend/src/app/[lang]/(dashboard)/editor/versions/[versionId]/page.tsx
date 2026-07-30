import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import ArticleVersionDetailsPage from '@/views/kb/versions/ArticleVersionDetailsPage'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string; versionId: string }>
  searchParams: Promise<{ articleId?: string }>
}) {
  const { lang, versionId } = await params
  const { articleId = '' } = await searchParams
  const accessToken = await getServerAccessToken()

  return (
    <ArticleVersionDetailsPage
      lang={lang}
      articleId={articleId}
      versionId={versionId}
      accessToken={accessToken}
    />
  )
}
