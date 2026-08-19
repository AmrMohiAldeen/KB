import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerArticlePage from '@/views/kb/viewer/ViewerArticlePage'

export default async function ViewerArticleRoute({ params }: {
  params: Promise<{ solutionSlug: string; articleSlug: string }>
}) {
  const [{ solutionSlug, articleSlug }, accessToken] = await Promise.all([params, getInternalPreviewAccessToken()])
  return accessToken
    ? <ViewerArticlePage articleSlug={articleSlug} preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerArticlePage solutionSlug={solutionSlug} articleSlug={articleSlug} />
}
