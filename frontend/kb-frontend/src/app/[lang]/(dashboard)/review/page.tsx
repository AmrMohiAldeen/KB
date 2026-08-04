// View Imports
import ReviewPlannerBoard from '@/views/kb/review/ReviewPlannerBoard'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function ReviewPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const accessToken = await getServerAccessToken()

  return <ReviewPlannerBoard lang={lang} accessToken={accessToken} />
}
