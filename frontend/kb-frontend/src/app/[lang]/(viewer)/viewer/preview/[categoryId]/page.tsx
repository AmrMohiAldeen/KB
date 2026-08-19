import { redirect } from 'next/navigation'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'
import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerPreviewRoute({ params }: {
  params: Promise<{ categoryId: string }>
}) {
  const [{ categoryId }, accessToken] = await Promise.all([params, getServerAccessToken()])
  if (!accessToken) redirect('/not-authorized')
  return <ViewerPortalPage preview={{ categoryId, accessToken }} />
}
