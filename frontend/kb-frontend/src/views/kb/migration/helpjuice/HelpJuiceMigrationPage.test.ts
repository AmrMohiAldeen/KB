import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HelpJuiceMigrationPage from './HelpJuiceMigrationPage'
import { helpJuiceMigrationsApi } from '@/lib/api/helpJuiceMigrationsApi'
import { ApiError } from '@/lib/api/http'
import { AccessTokenProvider } from '@/lib/auth/accessTokenContext'

describe('HelpJuiceMigrationPage options',()=>{
  let root:Root|undefined;let host:HTMLDivElement|undefined
  const completedUsersStatus=()=>vi.fn().mockResolvedValue({isCompleted:true,jobId:'users-job',status:'Completed',completedAt:new Date().toISOString()})
  afterEach(async()=>{if(root)await act(async()=>root?.unmount());host?.remove();root=undefined;host=undefined})

  it('allows selecting conflict behavior and publication/media options before validation',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const api={...helpJuiceMigrationsApi,usersStatus:completedUsersStatus(),run:vi.fn(helpJuiceMigrationsApi.run)}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const update=host.querySelector<HTMLInputElement>('input[value="UpdateExisting"]')!
    await act(async()=>update.click())
    expect(update.checked).toBe(true)
    const media=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[3]
    expect(media.checked).toBe(true);await act(async()=>media.click());expect(media.checked).toBe(false)
  })

  it('renders users first, explains the content prerequisite, and migrates users.csv with results',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const response={jobId:'job-users',status:'CompletedWithErrors',originalFileName:'users.csv',
      startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),totalRows:5,
      importedUsers:2,updatedUsers:1,skippedUsers:1,failedUsers:1,
      issues:[{id:'u1',severity:'Warning' as const,fileName:'users.csv',rowNumber:5,errorCode:'USER_SKIPPED',message:'User row was skipped.',createdAt:new Date().toISOString()}]}
    const runUsers=vi.fn().mockReturnValue({promise:Promise.resolve(response),cancel:vi.fn()})
    const api={...helpJuiceMigrationsApi,usersStatus:vi.fn().mockResolvedValue({isCompleted:false}),runUsers}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const text=host.textContent ?? ''
    expect(text.indexOf('1. Users Migration')).toBeLessThan(text.indexOf('2. HelpJuice Content Migration'))
    expect(text).toContain('Complete Users Migration before Content Migration')
    expect(text).toContain('HelpJuice ID first, then email')
    expect(text).toContain('never passwords or roles')
    const input=host.querySelector<HTMLInputElement>('input[accept=".csv,text/csv"]')!
    const usersFile=new File(['id,email\n1,a@example.test'],'gamalearn-users-2026-08-19.csv')
    Object.defineProperty(input,'files',{configurable:true,value:[usersFile]})
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))
    await act(async()=>Array.from(host!.querySelectorAll('button')).find(button=>button.textContent==='Migrate users')?.click())
    expect(document.body.textContent).toContain('Confirm Users Migration')
    await act(async()=>Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent==='Start users migration')?.click())
    expect(runUsers).toHaveBeenCalledWith(usersFile,'token',expect.any(Function))
    expect(host.textContent).toContain('Total rows')
    expect(host.textContent).toContain('User row was skipped.')
    expect(host.textContent).toContain('Issue CSV')
  })

  it('enables users migration from dashboard authentication while authorization is loading',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    let resolveStatus!: (status: {isCompleted: boolean}) => void
    const api={...helpJuiceMigrationsApi,usersStatus:vi.fn().mockReturnValue(new Promise(resolve=>{resolveStatus=resolve}))}
    await act(async()=>root?.render(createElement(AccessTokenProvider,{
      accessToken:'dashboard-token',children:createElement(HelpJuiceMigrationPage,{api})
    })))
    const input=host.querySelector<HTMLInputElement>('input[accept=".csv,text/csv"]')!
    Object.defineProperty(input,'files',{configurable:true,value:[new File(['id,email\n1,a@example.test'],'gamalearn-users.csv')]})
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))
    const button=Array.from(host.querySelectorAll('button')).find(candidate=>candidate.textContent==='Migrate users')!
    expect(button.disabled).toBe(false)
    await act(async()=>resolveStatus({isCompleted:false}))
    expect(api.usersStatus).toHaveBeenCalledWith('dashboard-token')
  })

  it('keeps users migration disabled and explains a genuine authorization denial',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const api={...helpJuiceMigrationsApi,usersStatus:vi.fn().mockRejectedValue(
      new ApiError(403,{title:'Forbidden',detail:'Forbidden'}))}
    await act(async()=>root?.render(createElement(HelpJuiceMigrationPage,{accessToken:'token',api})))
    const input=host.querySelector<HTMLInputElement>('input[accept=".csv,text/csv"]')!
    Object.defineProperty(input,'files',{configurable:true,value:[new File(['id,email\n1,a@example.test'],'gamalearn-users.csv')]})
    await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))
    const button=Array.from(host.querySelectorAll('button')).find(candidate=>candidate.textContent==='Migrate users')!
    expect(button.disabled).toBe(true)
    expect(host.textContent).toContain('HelpJuice migration requires a KB administrator.')
  })

  it('shows the limited backend preview and opens a read-only article with row-scoped issues',async()=>{
    host=document.createElement('div');document.body.append(host);root=createRoot(host)
    const api={...helpJuiceMigrationsApi,usersStatus:completedUsersStatus(),preview:vi.fn().mockResolvedValue({
      previewLimit:100,sourceArticleCount:250,sourceCategoryCount:4,isLimited:true,
      availableFiles:['questions.csv','answers.csv'],missingRequiredFiles:[],unsupportedFiles:[],packageIssues:[],
      articles:[{externalId:'q1',questionRowNumber:2,answerExternalId:'a1',answerRowNumber:7,title:'Preview article',
        slug:'preview-article',isPublished:true,categoryExternalId:'c1',categoryLocation:'Guides / Setup',
        visibility:'Internal',helpJuiceAuthorId:'u1',authorUserId:'kb-user-1',authorName:'Ada Lovelace',
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
    await act(async()=>Array.from(host!.querySelectorAll('button')).find(button=>button.textContent==='Review and migrate content')?.click())
    expect(document.body.textContent).toContain('Users Migration must be completed before Content Migration.')
    await act(async()=>Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent==='Cancel')?.click())
    await act(async()=>Array.from(host!.querySelectorAll('button')).find(button=>button.textContent==='View article')?.click())
    expect(document.body.textContent).toContain('Read-only preview')
    expect(document.body.textContent).toContain('Internal')
    expect(document.body.textContent).toContain('Ada Lovelace')
    expect(document.body.textContent).toContain('HelpJuice account ID')
    expect(document.body.textContent).toContain('kb-user-1')
    expect(document.body.textContent).toContain('Parsed body text')
    expect(document.body.textContent).toContain('Warning: MEDIA_UNRESOLVED')
    expect(document.body.textContent).toContain('answers.csv · row 7 · ID a1')
  })
})
