import { describe, expect, it } from 'vitest'
import { articleAuthor, historicalHelpJuiceAuthor, isHistoricalHelpJuiceArticle } from './articleAuthor'

describe('article attribution', () => {
  it('prefers the historical name, then email, and clearly identifies an unresolved external ID', () => {
    expect(articleAuthor({ owner: { fullName: 'Migration admin' }, legacyAuthorName: 'Ada Lovelace', legacyAuthorEmail: 'ada@example.test', legacyAuthorExternalId: '123' })).toBe('Ada Lovelace')
    expect(articleAuthor({ owner: { fullName: 'Migration admin' }, legacyAuthorEmail: 'ada@example.test', legacyAuthorExternalId: '123' })).toBe('ada@example.test')
    expect(articleAuthor({ owner: { fullName: 'Migration admin' }, legacyAuthorExternalId: '123' })).toBe('Unresolved Helpjuice author (123)')
  })

  it('uses the KB owner only for a non-migrated article', () => {
    const article = { owner: { fullName: 'Current author' } }
    expect(isHistoricalHelpJuiceArticle(article)).toBe(false)
    expect(historicalHelpJuiceAuthor(article)).toBeUndefined()
    expect(articleAuthor(article)).toBe('Current author')
  })
})
