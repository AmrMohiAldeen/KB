// MUI Imports
import Button from '@mui/material/Button'
import { notFound } from 'next/navigation'

// Type Imports
import type { ChildrenType } from '@core/types'
import type { Locale } from '@configs/i18n'

// Layout Imports
import LayoutWrapper from '@layouts/LayoutWrapper'
import VerticalLayout from '@layouts/VerticalLayout'
import HorizontalLayout from '@layouts/HorizontalLayout'

// Component Imports
import Providers from '@components/Providers'
import Navigation from '@components/layout/vertical/Navigation'
import Header from '@components/layout/horizontal/Header'
import Navbar from '@components/layout/vertical/Navbar'
import VerticalFooter from '@components/layout/vertical/Footer'
import HorizontalFooter from '@components/layout/horizontal/Footer'
import ScrollToTop from '@core/components/scroll-to-top'

// Config Imports
import { i18n } from '@configs/i18n'

// Util Imports
import { getDictionary } from '@/utils/getDictionary'
import { getMode, getSystemMode } from '@core/utils/serverHelpers'
import { getServerAccessToken } from '@/lib/auth/serverAccessToken'

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

const Layout = async ({ children, params }: ChildrenType & { params: Promise<unknown> }) => {
  // Vars
  const lang = await getLangParam(params)
  const direction = i18n.langDirection[lang]
  const dictionary = await getDictionary(lang)
  const [mode, systemMode, accessToken] = await Promise.all([
    getMode(),
    getSystemMode(),
    getServerAccessToken()
  ])

  return (
    <Providers direction={direction}>
      <LayoutWrapper
        systemMode={systemMode}
        verticalLayout={
          <VerticalLayout
            navigation={<Navigation dictionary={dictionary} mode={mode} systemMode={systemMode} />}
            navbar={<Navbar accessToken={accessToken} />}
            footer={<VerticalFooter />}
          >
            {children}
          </VerticalLayout>
        }
        horizontalLayout={
          <HorizontalLayout header={<Header dictionary={dictionary} accessToken={accessToken} />} footer={<HorizontalFooter />}>
            {children}
          </HorizontalLayout>
        }
      />
      <ScrollToTop className='mui-fixed'>
        <Button variant='contained' className='is-10 bs-10 rounded-full p-0 min-is-0 flex items-center justify-center'>
          <i className='tabler-arrow-up' />
        </Button>
      </ScrollToTop>
    </Providers>
  )
}

export default Layout
