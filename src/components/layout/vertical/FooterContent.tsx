'use client'

// Next Imports
import Link from 'next/link'
import { useParams } from 'next/navigation'

// Third-party Imports
import classnames from 'classnames'

// Type Imports
import type { Locale } from '@configs/i18n'

// Hook Imports
import useVerticalNav from '@menu/hooks/useVerticalNav'
import useHorizontalNav from '@menu/hooks/useHorizontalNav'
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { verticalLayoutClasses } from '@layouts/utils/layoutClasses'
import { getLocalizedUrl } from '@/utils/i18n'

const FooterContent = () => {
  // Hooks
  const { settings } = useSettings()
  const { lang: locale } = useParams<{ lang: Locale }>()
  const { isBreakpointReached: isVerticalBreakpointReached } = useVerticalNav()
  const { isBreakpointReached: isHorizontalBreakpointReached } = useHorizontalNav()

  // Vars
  const isBreakpointReached =
    settings.layout === 'vertical' ? isVerticalBreakpointReached : isHorizontalBreakpointReached

  return (
    <div className={classnames(verticalLayoutClasses.footerContent, 'flex items-center justify-between flex-wrap gap-4')}>
      <p className='text-textSecondary'>{`Copyright ${new Date().getFullYear()} SwiftAssess KB`}</p>
      {!isBreakpointReached && (
        <div className='flex items-center gap-4'>
          <Link href={getLocalizedUrl('/articles', locale)} className='text-primary'>
            Articles
          </Link>
          <Link href={getLocalizedUrl('/review', locale)} className='text-primary'>
            Review
          </Link>
          <Link href={getLocalizedUrl('/settings', locale)} className='text-primary'>
            Settings
          </Link>
        </div>
      )}
    </div>
  )
}

export default FooterContent
