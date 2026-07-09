// Type Imports
import type { Locale } from '@configs/i18n'
import { notFound } from 'next/navigation'

// Component Imports
import Providers from '@components/Providers'
import BlankLayout from '@layouts/BlankLayout'
import NotFound from '@views/NotFound'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getSystemMode } from '@core/utils/serverHelpers'

const isLocale = (value: string): value is Locale => i18n.locales.includes(value as Locale)

const getLangParam = async (params: Promise<unknown>) => {
  const resolvedParams = await params

  if (!resolvedParams || typeof resolvedParams !== 'object' || !('lang' in resolvedParams)) {
    notFound()
  }

  const lang = String((resolvedParams as { lang: unknown }).lang)

  if (!isLocale(lang)) notFound()

  return lang
}

const NotFoundPage = async ({ params }: { params: Promise<unknown> }) => {
  // Vars
  const lang = await getLangParam(params)
  const direction = i18n.langDirection[lang]
  const systemMode = await getSystemMode()

  return (
    <Providers direction={direction}>
      <BlankLayout systemMode={systemMode}>
        <NotFound />
      </BlankLayout>
    </Providers>
  )
}

export default NotFoundPage
