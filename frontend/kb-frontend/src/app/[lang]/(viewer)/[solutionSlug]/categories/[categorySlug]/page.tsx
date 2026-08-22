import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerCategoryRoute({ params }: {
  params: Promise<{ solutionSlug: string; categorySlug: string }>
}) {
  const [{ solutionSlug, categorySlug }, accessToken] = await Promise.all([
    params,
    getInternalPreviewAccessToken()
  ])
  return accessToken
    ? <ViewerPortalPage categorySlug={categorySlug} preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerPortalPage solutionSlug={solutionSlug} categorySlug={categorySlug} />
}
