import { afterEach, describe, expect, it } from 'vitest'
import HelpJuiceMigrationRoutePage from './page'

describe('HelpJuiceMigrationRoutePage', () => {
  const originalAccessToken = process.env.KB_DEV_ACCESS_TOKEN

  afterEach(() => {
    if (originalAccessToken === undefined) delete process.env.KB_DEV_ACCESS_TOKEN
    else process.env.KB_DEV_ACCESS_TOKEN = originalAccessToken
  })

  it('passes the server-side development access token to the migration client', async () => {
    process.env.KB_DEV_ACCESS_TOKEN = 'development-token'

    const page = await HelpJuiceMigrationRoutePage()

    expect(page.props.accessToken).toBe('development-token')
  })

  it('fails clearly when the development access token is not configured', async () => {
    delete process.env.KB_DEV_ACCESS_TOKEN

    await expect(HelpJuiceMigrationRoutePage()).rejects.toThrow('KB_DEV_ACCESS_TOKEN is not set')
  })
})
