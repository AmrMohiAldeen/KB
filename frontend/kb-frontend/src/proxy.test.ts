import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { proxy, resolveLocale } from './proxy'

describe('viewer locale precedence', () => {
  it('prefers a URL locale over the stored locale', () => {
    expect(resolveLocale('ar', 'fr')).toBe('ar')
  })

  it('uses the cookie when the clean route has no locale', () => {
    expect(resolveLocale(undefined, 'fr')).toBe('fr')
  })

  it('uses the configured default when URL and cookie are absent or invalid', () => {
    expect(resolveLocale()).toBe('en')
    expect(resolveLocale(undefined, 'not-enabled')).toBe('en')
  })

  it('lets the Viewer API choose its configured default for a clean route with no cookie', () => {
    const response = proxy(new NextRequest('https://kb.example.test/swiftassess'))
    const rewrite = response.headers.get('x-middleware-rewrite')

    expect(rewrite).toContain('/en/swiftassess')
    expect(rewrite).toContain('__viewerDefaultLocale=1')
  })

  it('uses the persisted locale for a clean viewer route', () => {
    const response = proxy(new NextRequest('https://kb.example.test/swiftassess', {
      headers: { cookie: 'kb-viewer-locale=fr' }
    }))
    const rewrite = response.headers.get('x-middleware-rewrite')

    expect(rewrite).toContain('/fr/swiftassess')
    expect(rewrite).not.toContain('__viewerDefaultLocale')
  })
})
