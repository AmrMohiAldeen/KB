import Box from '@mui/material/Box'
import Providers from '@components/Providers'
import type { Locale } from '@configs/i18n'
import { i18n } from '@configs/i18n'
import { notFound } from 'next/navigation'

export default async function ViewerLayout({ children, params }: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!i18n.locales.includes(lang as Locale)) notFound()
  return <Providers direction={i18n.langDirection[lang as Locale]}><Box component='main' sx={{ minBlockSize: '100vh', p: { xs: 4, md: 8 }, bgcolor: 'background.default' }}>{children}</Box></Providers>
}
