import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHelpJuiceUserMigrationStatus, previewHelpJuiceMigration, runHelpJuiceDiagnostic, runHelpJuiceMigration, runHelpJuiceUserMigration, type HelpJuiceMigrationOptions } from './helpJuiceMigrationsApi'

const options:HelpJuiceMigrationOptions={importPublished:true,importUnpublishedAsDrafts:true,importCategories:true,importMedia:false,preserveTimestamps:true,conflictBehavior:'UpdateExisting'}

describe('helpJuiceMigrationsApi',()=>{
  beforeEach(()=>{process.env.NEXT_PUBLIC_KB_API_BASE_URL='https://kb-api.example.test'})
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.NEXT_PUBLIC_KB_API_BASE_URL})

  it('uploads files to the dedicated read-only preview endpoint',async()=>{
    const response={previewLimit:100,sourceArticleCount:1,sourceCategoryCount:0,isLimited:false,
      availableFiles:['questions.csv','answers.csv'],missingRequiredFiles:[],unsupportedFiles:[],packageIssues:[],articles:[]}
    const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>response})
    vi.stubGlobal('fetch',fetchMock)
    await expect(previewHelpJuiceMigration([new File(['id,name'],'questions.csv')],'token')).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith('https://kb-api.example.test/api/migrations/helpjuice/preview',expect.objectContaining({method:'POST',body:expect.any(FormData)}))
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('loads the persisted users-migration prerequisite status',async()=>{
    const status={isCompleted:true,jobId:'users-job',status:'Completed',completedAt:new Date().toISOString()}
    const fetchMock=vi.fn().mockResolvedValue({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>status})
    vi.stubGlobal('fetch',fetchMock)
    await expect(getHelpJuiceUserMigrationStatus('token')).resolves.toEqual(status)
    expect(fetchMock).toHaveBeenCalledWith('https://kb-api.example.test/api/migrations/helpjuice/users/status',expect.any(Object))
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer token')
  })

  it('runs one synchronous multipart request and reports upload progress',async()=>{
    let sent:FormData|undefined
    const headers:Record<string,string>={}
    class FakeRequest {
      status=200;responseText=JSON.stringify({status:'CompletedWithErrors',originalFileName:'manual.zip',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),options,validation:{blockingErrorCount:0,warningCount:1},result:{importedItems:2,failedItems:1},phases:[{phase:'Articles',status:'CompletedWithErrors',totalItems:3,processedItems:3,importedItems:2,updatedItems:0,skippedItems:0,failedItems:1}],issues:[{id:'e1',severity:'Error',errorCode:'ROW_FAILED',message:'bad row',createdAt:new Date().toISOString()}]});upload:{onprogress?: (event:ProgressEvent)=>void}={};onload?:()=>void;onerror?:()=>void;onabort?:()=>void
      open(method:string,url:string){expect(method).toBe('POST');expect(url).toContain('/api/migrations/helpjuice');expect(url).not.toContain('/validate')}
      setRequestHeader(name:string,value:string){headers[name]=value}
      send(body:FormData){sent=body;this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10} as ProgressEvent);this.onload?.()}
      abort(){this.onabort?.()}
    }
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const progress=vi.fn();const request=runHelpJuiceMigration([new File(['id,name'],'questions.csv'),new File(['id,question_id,body'],'answers.csv')],options,'token',progress)
    await expect(request.promise).resolves.toMatchObject({status:'CompletedWithErrors',result:{importedItems:2,failedItems:1},issues:[{message:'bad row'}]})
    expect(progress).toHaveBeenCalledWith(50);expect(sent?.getAll('files')).toHaveLength(2);expect(JSON.parse(String(sent?.get('options')))).toMatchObject({conflictBehavior:'UpdateExisting',importMedia:false})
    expect(headers.Authorization).toBe('Bearer token')
  })

  it('aborts the same in-flight request used for the import',async()=>{
    class FakeRequest {status=0;responseText='';upload={} as XMLHttpRequestUpload;onload?:()=>void;onerror?:()=>void;onabort?:()=>void;open(){}setRequestHeader(){}send(){}abort(){this.onabort?.()}}
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const request=runHelpJuiceMigration([new File(['x'],'questions.csv')],options,'token');request.cancel()
    await expect(request.promise).rejects.toMatchObject({name:'AbortError'})
  })

  it('posts one dated users CSV file to the users endpoint and reports upload progress',async()=>{
    let sent:FormData|undefined
    const headers:Record<string,string>={}
    class FakeRequest {
      status=200;responseText=JSON.stringify({jobId:'job-1',status:'CompletedWithErrors',originalFileName:'users.csv',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),totalRows:4,importedUsers:2,updatedUsers:1,skippedUsers:0,failedUsers:1,issues:[]});upload:{onprogress?: (event:ProgressEvent)=>void}={};onload?:()=>void;onerror?:()=>void;onabort?:()=>void
      open(method:string,url:string){expect(method).toBe('POST');expect(url).toBe('https://kb-api.example.test/api/migrations/helpjuice/users')}
      setRequestHeader(name:string,value:string){headers[name]=value}
      send(body:FormData){sent=body;this.upload.onprogress?.({lengthComputable:true,loaded:3,total:4} as ProgressEvent);this.onload?.()}
      abort(){this.onabort?.()}
    }
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const file=new File(['id,email\n1,a@example.test'],'gamalearn-users-2026-08-19.csv')
    const progress=vi.fn();const request=runHelpJuiceUserMigration(file,'token',progress)
    await expect(request.promise).resolves.toMatchObject({totalRows:4,importedUsers:2,updatedUsers:1,failedUsers:1})
    expect(progress).toHaveBeenCalledWith(75)
    expect(sent?.getAll('files')).toHaveLength(1)
    expect((sent?.get('files') as File).name).toBe('gamalearn-users-2026-08-19.csv')
    expect(headers.Authorization).toBe('Bearer token')
  })

  it('downloads the read-only full diagnostic and reports upload and scan status',async()=>{
    const report=new Blob(['Section,Severity\r\nSummary,'])
    const headers:Record<string,string>={}
    class FakeRequest {
      status=200;response=report;responseType:XMLHttpRequestResponseType='';upload:{onprogress?:(event:ProgressEvent)=>void;onload?:()=>void}={};onload?:()=>void;onerror?:()=>void;onabort?:()=>void
      open(method:string,url:string){expect(method).toBe('POST');expect(url).toBe('https://kb-api.example.test/api/migrations/helpjuice/diagnostics')}
      setRequestHeader(name:string,value:string){headers[name]=value}
      getResponseHeader(name:string){return ({'Content-Disposition':'attachment; filename="diagnostic.csv"','X-HelpJuice-Diagnostic-Records':'42','X-HelpJuice-Diagnostic-Errors':'3','X-HelpJuice-Diagnostic-Warnings':'7','X-HelpJuice-Diagnostic-Status':'Completed'} as Record<string,string>)[name]??null}
      send(){this.upload.onprogress?.({lengthComputable:true,loaded:1,total:2} as ProgressEvent);this.upload.onload?.();this.onload?.()}
      abort(){this.onabort?.()}
    }
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const progress=vi.fn();const scanning=vi.fn()
    const request=runHelpJuiceDiagnostic([new File(['zip'],'export.zip')],'token',progress,scanning)
    await expect(request.promise).resolves.toMatchObject({blob:report,fileName:'diagnostic.csv',totalRecords:42,errorCount:3,warningCount:7,status:'Completed'})
    expect(progress).toHaveBeenCalledWith(50);expect(progress).toHaveBeenCalledWith(100);expect(scanning).toHaveBeenCalledOnce()
    expect(headers.Authorization).toBe('Bearer token')
  })
})
