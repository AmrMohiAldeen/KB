// View Imports
import PublicKnowledgeBaseHome from '@/views/kb/public/PublicKnowledgeBaseHome'

export default async function KbHomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params

  return <PublicKnowledgeBaseHome lang={lang} />
}
