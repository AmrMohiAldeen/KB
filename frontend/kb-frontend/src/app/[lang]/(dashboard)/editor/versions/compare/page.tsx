import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import ArticleVersionComparisonPage from '@/views/kb/versions/ArticleVersionComparisonPage'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{
    articleId?: string
    baseVersionId?: string
    targetVersionId?: string
  }>
}) {
  const { lang } = await params
  const {
    articleId = '',
    baseVersionId = '',
    targetVersionId = ''
  } = await searchParams
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return (
    <ArticleVersionComparisonPage
      lang={lang}
      articleId={articleId}
      baseVersionId={baseVersionId}
      targetVersionId={targetVersionId}
      accessToken={accessToken}
    />
  )
}
