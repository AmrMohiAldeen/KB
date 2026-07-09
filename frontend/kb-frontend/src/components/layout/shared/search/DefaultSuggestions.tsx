// Next Imports
import Link from 'next/link'
import { useParams } from 'next/navigation'

// Third-party Imports
import { useKBar } from 'kbar'
import classnames from 'classnames'

// Type Imports
import type { Locale } from '@configs/i18n'

// Util Imports
import { getLocalizedUrl } from '@/utils/i18n'

type DefaultSuggestionsType = {
  sectionLabel: string
  items: {
    label: string
    href: string
    icon?: string
  }[]
}

const defaultSuggestions: DefaultSuggestionsType[] = [
  {
    sectionLabel: 'Content',
    items: [
      {
        label: 'Articles',
        href: '/articles',
        icon: 'tabler-article'
      },
      {
        label: 'Article Editor',
        href: '/editor',
        icon: 'tabler-pencil'
      },
      {
        label: 'Categories',
        href: '/categories',
        icon: 'tabler-folder'
      },
      {
        label: 'Templates',
        href: '/templates',
        icon: 'tabler-template'
      }
    ]
  },
  {
    sectionLabel: 'Workflow',
    items: [
      {
        label: 'Review Dashboard',
        href: '/review',
        icon: 'tabler-checkup-list'
      },
      {
        label: 'Notifications',
        href: '/notifications',
        icon: 'tabler-bell'
      },
      {
        label: 'Audit Logs',
        href: '/audit-logs',
        icon: 'tabler-history'
      },
      {
        label: 'Reusable Blocks',
        href: '/reusable-blocks',
        icon: 'tabler-components'
      }
    ]
  },
  {
    sectionLabel: 'Operations',
    items: [
      {
        label: 'Media',
        href: '/media',
        icon: 'tabler-photo'
      },
      {
        label: 'Search Index',
        href: '/search-index',
        icon: 'tabler-database-search'
      },
      {
        label: 'Export Jobs',
        href: '/export-jobs',
        icon: 'tabler-file-export'
      }
    ]
  },
  {
    sectionLabel: 'Administration',
    items: [
      {
        label: 'Users',
        href: '/users',
        icon: 'tabler-users'
      },
      {
        label: 'Roles',
        href: '/roles',
        icon: 'tabler-shield-lock'
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: 'tabler-settings'
      }
    ]
  }
]

const DefaultSuggestions = () => {
  // Hooks
  const { query } = useKBar()
  const { lang: locale } = useParams()

  return (
    <div className='flex grow flex-wrap gap-x-[48px] gap-y-8 plb-14 pli-16 overflow-y-auto overflow-x-hidden'>
      {defaultSuggestions.map((section, index) => (
        <div
          key={index}
          className='flex flex-col justify-center overflow-x-hidden gap-4 basis-full sm:basis-[calc((100%-3rem)/2)]'
        >
          <p className='text-xs leading-[1.16667] uppercase text-textDisabled tracking-[0.8px]'>
            {section.sectionLabel}
          </p>
          <ul className='flex flex-col gap-4'>
            {section.items.map((item, i) => (
              <li key={i} className='flex'>
                <Link
                  href={getLocalizedUrl(item.href, locale as Locale)}
                  onClick={query.toggle}
                  className='flex items-center overflow-x-hidden cursor-pointer gap-2 hover:text-primary focus-visible:text-primary focus-visible:outline-0'
                >
                  {item.icon && <i className={classnames(item.icon, 'flex text-xl')} />}
                  <p className='text-[15px] leading-[1.4667] truncate'>{item.label}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default DefaultSuggestions
