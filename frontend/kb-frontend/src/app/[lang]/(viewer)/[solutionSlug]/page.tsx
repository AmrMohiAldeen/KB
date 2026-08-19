import ViewerPortalPage from '@/views/kb/viewer/ViewerPortalPage'

export default async function ViewerPortalRoute({ params }: {
  params: Promise<{ solutionSlug: string }>
}) {
  const { solutionSlug } = await params
  return <ViewerPortalPage solutionSlug={solutionSlug} />
}
