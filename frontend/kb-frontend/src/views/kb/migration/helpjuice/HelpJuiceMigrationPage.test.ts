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

  it('shows the limited backend preview and opens a read-only article with row-scoped issues',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const api={...helpJuiceMigrationsApi,preview:vi.fn().mockResolvedValue({
      previewLimit:100,sourceArticleCount:250,sourceCategoryCount:4,isLimited:true,
      availableFiles:['questions.csv','answers.csv'],missingRequiredFiles:[],unsupportedFiles:[],packageIssues:[],
      articles:[{externalId:'q1',questionRowNumber:2,answerExternalId:'a1',answerRowNumber:7,title:'Preview article',
        slug:'preview-article',isPublished:true,categoryExternalId:'c1',categoryLocation:'Guides / Setup',
        visibility:'Internal',legacyAuthorName:'Ada Lovelace',legacyAuthorExternalId:'u1',
        contentHtml:'<p>Parsed body text</p>',contentTextLength:16,sourceMetadata:{'question.user_id':'u1'},
        issues:[{id:'w1',severity:'Warning',fileName:'answers.csv',rowNumber:7,externalEntityType:'Answer',externalId:'a1',errorCode:'MEDIA_UNRESOLVED',message:'Image is missing.',createdAt:new Date().toISOString()}]}]
    })}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const input=host.querySelector<HTMLInputElement>('input[multiple]')!
    Object.defineProperty(input,'files',{configurable:true,value:[
      new File(['id,name\nq1,One'],'questions.csv'),
      new File(['id,question_id,body\na1,q1,Body'],'answers.csv')
    ]})
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))
    expect(api.preview).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Showing 1 of 250 source articles (preview limit: 100).')
    expect(host.textContent).toContain('Run full diagnostic')
    expect(host.textContent).toContain('1 warning')
    await act(async()=>Array.from(host!.querySelectorAll('button')).find(button=>button.textContent==='View article')?.click())
    expect(document.body.textContent).toContain('Read-only preview')
    expect(document.body.textContent).toContain('Internal')
    expect(document.body.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).toContain('Parsed body text')
    expect(document.body.textContent).toContain('Warning: MEDIA_UNRESOLVED')
    expect(document.body.textContent).toContain('answers.csv · row 7 · ID a1')
  })
})
