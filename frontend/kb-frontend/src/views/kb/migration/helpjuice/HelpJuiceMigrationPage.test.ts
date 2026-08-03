import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpJuiceMigrationPage from './HelpJuiceMigrationPage'
import { helpJuiceMigrationsApi } from '@/lib/api/helpJuiceMigrationsApi'

describe('HelpJuiceMigrationPage options',()=>{
  let root:Root|undefined;let host:HTMLDivElement|undefined
  afterEach(async()=>{if(root)await act(async()=>root?.unmount());host?.remove();root=undefined;host=undefined})

  it('allows selecting conflict behavior and publication/media options before validation',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const api={...helpJuiceMigrationsApi,validate:vi.fn(helpJuiceMigrationsApi.validate),start:vi.fn(helpJuiceMigrationsApi.start),get:vi.fn(helpJuiceMigrationsApi.get),cancel:vi.fn(helpJuiceMigrationsApi.cancel),downloadErrors:vi.fn(helpJuiceMigrationsApi.downloadErrors)}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const update=host.querySelector<HTMLInputElement>('input[value="UpdateExisting"]')!
    await act(async()=>update.click())
    expect(update.checked).toBe(true)
    const media=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[3]
    expect(media.checked).toBe(true);await act(async()=>media.click());expect(media.checked).toBe(false)
  })
})
