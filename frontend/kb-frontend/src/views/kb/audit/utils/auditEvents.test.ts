import { describe, expect, it } from 'vitest'

import { formatAuditAction, formatAuditDetails, toUtcIso } from './auditEvents'

describe('audit event presentation', () => {
  it('uses human-readable labels for known and future action names', () => {
    expect(formatAuditAction('ArticleDraftLockForceReleased')).toBe('Draft force-unlocked')
    expect(formatAuditAction('MediaReplaced')).toBe('Media replaced')
    expect(formatAuditAction('UserRoleChanged')).toBe('Role changed')
    expect(formatAuditAction('ArticleCustomAction')).toBe('Custom Action')
  })

  it('formats optional JSON details without assuming an object shape', () => {
    expect(formatAuditDetails(null)).toBe('—')
    expect(formatAuditDetails({ versionNumber: 3 })).toBe('{"versionNumber":3}')
    expect(formatAuditDetails(true)).toBe('true')
  })

  it('converts valid local date filters to UTC and ignores empty values', () => {
    expect(toUtcIso('')).toBeUndefined()
    expect(toUtcIso('2026-07-01T10:00')).toMatch(/Z$/)
  })
})
