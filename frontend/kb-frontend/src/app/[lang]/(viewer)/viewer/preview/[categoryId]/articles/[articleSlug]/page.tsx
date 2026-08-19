import { redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerArticlePage from '@/views/kb/viewer/ViewerArticlePage'

export default async function ViewerPreviewArticleRoute({ params }: {
  params: Promise<{ categoryId: string; articleSlug: string }>
}) {
  const [{ categoryId, articleSlug }, accessToken] = await Promise.all([params, getServerAccessToken()])
  if (!accessToken) redirect('/not-authorized')
  return <ViewerArticlePage articleSlug={articleSlug} preview={{ categoryId, accessToken }} />
}
