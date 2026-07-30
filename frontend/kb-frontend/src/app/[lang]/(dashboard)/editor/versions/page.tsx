import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import ArticleVersionHistoryPage from '@/views/kb/versions/ArticleVersionHistoryPage'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ articleId?: string }>
}) {
  const { lang } = await params
  const { articleId = '' } = await searchParams
  const accessToken = await getServerAccessToken()

  return (
    <ArticleVersionHistoryPage
      lang={lang}
      articleId={articleId}
      accessToken={accessToken}
    />
  )
}
