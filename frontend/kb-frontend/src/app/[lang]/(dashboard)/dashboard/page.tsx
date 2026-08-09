import KnowledgeDashboard from '@/views/kb/dashboard/KnowledgeDashboard'

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ categoryId?: string }>
}) {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN
  const { categoryId = '' } = await searchParams

  if (!accessToken) {
    throw new Error("KB_DEV_ACCESS_TOKEN is not set");
  }


  return <KnowledgeDashboard accessToken={accessToken} initialCategoryId={categoryId} />
}
