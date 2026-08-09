// View Imports
import ReviewPlannerBoard from '@/views/kb/review/ReviewPlannerBoard'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

export default async function ReviewPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <ReviewPlannerBoard lang={lang} accessToken={accessToken} />
}
