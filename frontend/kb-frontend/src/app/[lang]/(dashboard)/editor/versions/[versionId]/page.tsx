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
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return (
    <ArticleVersionDetailsPage
      lang={lang}
      articleId={articleId}
      versionId={versionId}
      accessToken={accessToken}
    />
  )
}
