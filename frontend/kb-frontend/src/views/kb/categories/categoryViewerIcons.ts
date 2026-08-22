import {
  BarChart3,
  BookOpen,
  Folder,
  GraduationCap,
  LifeBuoy,
  Rocket,
  Settings,
  ShieldCheck
} from 'lucide-react'
import { createElement } from 'react'
import type { ComponentProps } from 'react'

export const categoryViewerIcons = [
  { value: 'folder', label: 'Folder', icon: Folder },
  { value: 'book-open', label: 'Book', icon: BookOpen },
  { value: 'graduation-cap', label: 'Learning', icon: GraduationCap },
  { value: 'life-buoy', label: 'Support', icon: LifeBuoy },
  { value: 'settings', label: 'Settings', icon: Settings },
  { value: 'rocket', label: 'Launch', icon: Rocket },
  { value: 'shield-check', label: 'Security', icon: ShieldCheck },
  { value: 'chart', label: 'Analytics', icon: BarChart3 }
] as const

export const renderCategoryViewerIcon = (
  value?: string | null,
  props: ComponentProps<typeof Folder> = {}
) => createElement(categoryViewerIcons.find(option => option.value === value)?.icon ?? Folder, props)
