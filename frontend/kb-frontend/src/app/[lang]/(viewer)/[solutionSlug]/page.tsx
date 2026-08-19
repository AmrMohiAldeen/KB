import { getInternalPreviewAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerPortalRoute({ params }: {
  params: Promise<{ solutionSlug: string }>
}) {
  const [{ solutionSlug }, accessToken] = await Promise.all([params, getInternalPreviewAccessToken()])
  return accessToken
    ? <ViewerPortalPage preview={{ categorySlug: solutionSlug, accessToken }} />
    : <ViewerPortalPage solutionSlug={solutionSlug} />
}
