import PublicKnowledgeBaseHome from '@/views/kb/PublicKnowledgeBaseHome'

export default async function KbHomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params

  return <PublicKnowledgeBaseHome lang={lang} />
}

