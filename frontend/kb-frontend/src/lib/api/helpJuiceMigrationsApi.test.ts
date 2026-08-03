import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runHelpJuiceMigration, type HelpJuiceMigrationOptions } from './helpJuiceMigrationsApi'

const options:HelpJuiceMigrationOptions={importPublished:true,importUnpublishedAsDrafts:true,importCategories:true,importMedia:false,preserveTimestamps:true,conflictBehavior:'UpdateExisting'}

describe('helpJuiceMigrationsApi',()=>{
  beforeEach(()=>{process.env.NEXT_PUBLIC_KB_API_BASE_URL='https://kb-api.example.test'})
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.NEXT_PUBLIC_KB_API_BASE_URL})

  it('runs one synchronous multipart request and reports upload progress',async()=>{
    let sent:FormData|undefined
    class FakeRequest {
      status=200;responseText=JSON.stringify({status:'CompletedWithErrors',originalFileName:'manual.zip',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),options,validation:{blockingErrorCount:0,warningCount:1},result:{importedItems:2,failedItems:1},phases:[{phase:'Articles',status:'CompletedWithErrors',totalItems:3,processedItems:3,importedItems:2,updatedItems:0,skippedItems:0,failedItems:1}],issues:[{id:'e1',severity:'Error',errorCode:'ROW_FAILED',message:'bad row',createdAt:new Date().toISOString()}]});upload:{onprogress?: (event:ProgressEvent)=>void}={};onload?:()=>void;onerror?:()=>void;onabort?:()=>void
      open(method:string,url:string){expect(method).toBe('POST');expect(url).toContain('/api/migrations/helpjuice');expect(url).not.toContain('/validate')}
      setRequestHeader(){}
      send(body:FormData){sent=body;this.upload.onprogress?.({lengthComputable:true,loaded:5,total:10} as ProgressEvent);this.onload?.()}
      abort(){this.onabort?.()}
    }
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const progress=vi.fn();const request=runHelpJuiceMigration([new File(['id,name'],'questions.csv'),new File(['id,question_id,body'],'answers.csv')],options,'token',progress)
    await expect(request.promise).resolves.toMatchObject({status:'CompletedWithErrors',result:{importedItems:2,failedItems:1},issues:[{message:'bad row'}]})
    expect(progress).toHaveBeenCalledWith(50);expect(sent?.getAll('files')).toHaveLength(2);expect(JSON.parse(String(sent?.get('options')))).toMatchObject({conflictBehavior:'UpdateExisting',importMedia:false})
  })

  it('aborts the same in-flight request used for the import',async()=>{
    class FakeRequest {status=0;responseText='';upload={} as XMLHttpRequestUpload;onload?:()=>void;onerror?:()=>void;onabort?:()=>void;open(){}setRequestHeader(){}send(){}abort(){this.onabort?.()}}
    vi.stubGlobal('XMLHttpRequest',FakeRequest)
    const request=runHelpJuiceMigration([new File(['x'],'questions.csv')],options,'token');request.cancel()
    await expect(request.promise).rejects.toMatchObject({name:'AbortError'})
  })
})
