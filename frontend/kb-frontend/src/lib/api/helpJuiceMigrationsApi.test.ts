import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelHelpJuiceMigration, getHelpJuiceMigration, startHelpJuiceMigration, validateHelpJuicePackage, type HelpJuiceMigrationOptions } from './helpJuiceMigrationsApi'

const options:HelpJuiceMigrationOptions={importPublished:true,importUnpublishedAsDrafts:true,importCategories:true,importMedia:false,preserveTimestamps:true,conflictBehavior:'UpdateExisting'}

describe('helpJuiceMigrationsApi',()=>{
  beforeEach(()=>{process.env.NEXT_PUBLIC_KB_API_BASE_URL='https://kb-api.example.test'})
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.NEXT_PUBLIC_KB_API_BASE_URL})

  it('creates one multipart validation job and reports upload progress',async()=>{
    let sent:FormData|undefined
    class FakeRequest {
      status=202;responseText=JSON.stringify({jobId:'job-1',status:'Pending',statusUrl:'/status'});upload:{onprogress?: (event:ProgressEvent)=>void}={};onload?:()=>void;onerror?:()=>void;onabort?:()=>void
      open(method:string,url:string){expect(method).toBe('POST');expect(url).toContain('/api/migrations/helpjuice/validate')}
      setRequestHeader(){}
      send(body:FormData){sent=body;this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10} as ProgressEvent);this.onload?.()}
      abort(){this.onabort?.()}
    }
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const progress=vi.fn();const request=validateHelpJuicePackage([new File(['id,name'],'questions.csv'),new File(['id,question_id,body'],'answers.csv')],options,'token',progress)
    await expect(request.promise).resolves.toMatchObject({jobId:'job-1'});expect(progress).toHaveBeenCalledWith(50);expect(sent?.getAll('files')).toHaveLength(2);expect(JSON.parse(String(sent?.get('options')))).toMatchObject({conflictBehavior:'UpdateExisting',importMedia:false})
  })

  it('starts, polls completed-with-errors progress, and cancels through job endpoints',async()=>{
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(json({jobId:'job-1',status:'Running',statusUrl:'/status'},202))
      .mockResolvedValueOnce(json({id:'job-1',status:'CompletedWithErrors',currentPhase:'Completed',totalItems:4,processedItems:4,importedItems:2,updatedItems:0,skippedItems:1,failedItems:1,issues:[{id:'e1',severity:'Error',errorCode:'ROW_FAILED',message:'bad row',createdAt:new Date().toISOString()}]},200))
      .mockResolvedValueOnce(new Response(null,{status:202}))
    vi.stubGlobal('fetch',fetchMock)
    await startHelpJuiceMigration('job-1',options,'token');const job=await getHelpJuiceMigration('job-1','token');await cancelHelpJuiceMigration('job-1','token')
    expect(job).toMatchObject({status:'CompletedWithErrors',processedItems:4,failedItems:1});expect(job.issues[0].message).toBe('bad row')
    expect(fetchMock.mock.calls[0][1].body).toContain('UpdateExisting');expect(fetchMock.mock.calls[2][0]).toContain('/job-1/cancel')
  })
})

const json=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})
