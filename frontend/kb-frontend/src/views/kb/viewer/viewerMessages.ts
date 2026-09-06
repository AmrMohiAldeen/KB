import en from '@/data/dictionaries/en.json'
import fr from '@/data/dictionaries/fr.json'
import ar from '@/data/dictionaries/ar.json'

const resources = { en, fr, ar } as const

export type ViewerMessages = typeof en.viewer
export type ViewerMessageKey = keyof ViewerMessages

export const getViewerMessages = (locale?: string): ViewerMessages =>
  resources[locale as keyof typeof resources]?.viewer ?? resources.en.viewer

export const formatViewerMessage = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
