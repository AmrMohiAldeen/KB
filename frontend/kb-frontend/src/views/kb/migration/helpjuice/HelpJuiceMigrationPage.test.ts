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
    const api={...helpJuiceMigrationsApi,run:vi.fn(helpJuiceMigrationsApi.run)}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const update=host.querySelector<HTMLInputElement>('input[value="UpdateExisting"]')!
    await act(async()=>update.click())
    expect(update.checked).toBe(true)
    const media=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[3]
    expect(media.checked).toBe(true);await act(async()=>media.click());expect(media.checked).toBe(false)
  })

  it('warns that the client preview is limited while the complete files are processed',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token'})))
    const input=host.querySelector<HTMLInputElement>('input[multiple]')!
    Object.defineProperty(input,'files',{configurable:true,value:[
      new File(['id,name\nq1,One'],'questions.csv'),
      new File(['id,question_id,body\na1,q1,Body'],'answers.csv')
    ]})
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))
    expect(host.textContent).toContain('Preview limited to the first 100 rows. The complete file will still be processed.')
    expect(host.textContent).not.toContain('too large for browser preview')
  })
})
