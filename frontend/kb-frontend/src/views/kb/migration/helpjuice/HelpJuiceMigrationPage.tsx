'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { Ban, Download, FileArchive, FileSpreadsheet, FolderOpen, PackageCheck, Play, RotateCcw, ShieldCheck } from 'lucide-react'

import { KbPageShell, KbSectionCard } from '@/views/shared'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import PageHeader from '../../shared/components/PageHeader'
import StatusChip from '../../shared/components/StatusChip'
import { describeApiError } from '@/lib/api/http'
import {
  helpJuiceMigrationsApi,
  type HelpJuiceMigrationJob,
  type HelpJuiceMigrationOptions,
  type HelpJuiceMigrationsApi,
  type MigrationIssue
} from '@/lib/api/helpJuiceMigrationsApi'
import { previewHelpJuiceFiles, type ClientPackagePreview } from './clientPreview'
import type { AnswerMigrationReviewRecord } from './types'

const TERMINAL = new Set(['Completed', 'CompletedWithErrors', 'Failed', 'Cancelled'])
const defaultOptions: HelpJuiceMigrationOptions = { importPublished:true,importUnpublishedAsDrafts:true,importCategories:true,importMedia:true,preserveTimestamps:true,conflictBehavior:'Skip' }

export type HelpJuiceMigrationPageProps = { accessToken: string; api?: HelpJuiceMigrationsApi }

const HelpJuiceMigrationPage = ({ accessToken, api = helpJuiceMigrationsApi }: HelpJuiceMigrationPageProps) => {
  const [files,setFiles]=useState<File[]>([]);const [preview,setPreview]=useState<ClientPackagePreview>();const [previewing,setPreviewing]=useState(false)
  const [messages,setMessages]=useState<string[]>(accessToken?[]:['Authentication is required.']);const [options,setOptions]=useState(defaultOptions)
  const [job,setJob]=useState<HelpJuiceMigrationJob>();const [submitting,setSubmitting]=useState(false);const [uploadProgress,setUploadProgress]=useState(0)
  const uploadCancel=useRef<(()=>void)|undefined>(undefined); const importRunning=job?.status==='Running'||job?.status==='Pending'||job?.status==='Validating'

  const selectFiles=useCallback(async(selected:File[])=>{setFiles(selected);setPreview(undefined);setJob(undefined);setMessages([]);if(!selected.length)return;setPreviewing(true);try{setPreview(await previewHelpJuiceFiles(selected))}catch(error){setMessages([error instanceof Error?error.message:'The package could not be previewed.'])}finally{setPreviewing(false)}},[])
  const onFiles=(event:ChangeEvent<HTMLInputElement>)=>{void selectFiles(Array.from(event.currentTarget.files??[]));event.currentTarget.value=''}

  useEffect(()=>{
    if(!job||TERMINAL.has(job.status)||job.status==='Ready')return
    const controller=new AbortController();const timer=window.setTimeout(()=>{api.get(job.id,accessToken,controller.signal).then(setJob).catch(error=>{if(!(error instanceof DOMException&&error.name==='AbortError'))setMessages(describeApiError(error))})},1200)
    return()=>{controller.abort();window.clearTimeout(timer)}
  },[accessToken,api,job])

  const validate=async()=>{if(submitting||!files.length||preview?.missingRequired.length)return;setSubmitting(true);setMessages([]);setUploadProgress(0);const upload=api.validate(files,options,accessToken,setUploadProgress);uploadCancel.current=upload.cancel;try{const accepted=await upload.promise;setJob(await api.get(accepted.jobId,accessToken))}catch(error){if(error instanceof DOMException&&error.name==='AbortError')setMessages(['Package upload was cancelled.']);else setMessages(describeApiError(error))}finally{uploadCancel.current=undefined;setSubmitting(false)}}
  const start=async()=>{if(!job||job.status!=='Ready'||submitting)return;setSubmitting(true);setMessages([]);try{await api.start(job.id,options,accessToken);setJob(await api.get(job.id,accessToken))}catch(error){setMessages(describeApiError(error))}finally{setSubmitting(false)}}
  const cancel=async()=>{if(submitting&&uploadCancel.current){uploadCancel.current();return}if(!job||TERMINAL.has(job.status))return;try{await api.cancel(job.id,accessToken);setJob({...job,cancellationRequested:true,currentPhase:'Cancellation requested'})}catch(error){setMessages(describeApiError(error))}}
  const download=async(format:'csv'|'json')=>{if(!job)return;try{const blob=await api.downloadErrors(job.id,format,accessToken);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`helpjuice-${job.id}-errors.${format}`;link.click();URL.revokeObjectURL(url)}catch(error){setMessages(describeApiError(error))}}
  const reset=()=>{uploadCancel.current?.();setFiles([]);setPreview(undefined);setJob(undefined);setMessages([]);setUploadProgress(0);setOptions(defaultOptions)}

  const candidates=preview?.build?.answerResults??[]
  const candidateColumns=useMemo<Array<KbDataTableColumn<AnswerMigrationReviewRecord>>>(()=>[
    {id:'article',label:'Article',render:item=><Box><Typography color='text.primary' sx={{fontWeight:700}}>{item.title||'Untitled article'}</Typography><Typography variant='body2' color='text.secondary'>Question {item.questionId} / Answer {item.answerId}</Typography></Box>},
    {id:'status',label:'Conversion',render:item=><StatusChip label={item.status} color={item.status==='failed'?'error':item.status==='warning'?'warning':'success'}/>},
    {id:'content',label:'Content',render:item=><Typography variant='body2'>{item.outputTextLength.toLocaleString()} text characters</Typography>},
    {id:'warnings',label:'Warnings',render:item=><Chip size='small' label={item.warnings.length} color={item.warnings.length?'warning':'default'} variant='tonal'/>}
  ],[])
  const progress=job?.totalItems?Math.min(100,Math.round(job.processedItems/job.totalItems*100)):0
  const isZip=files.length===1&&files[0].name.toLowerCase().endsWith('.zip')
  const canValidate=Boolean(accessToken&&files.length&&preview&&!preview.missingRequired.length&&(isZip||!preview.unsupported.length)&&!submitting&&!importRunning)
  const canStart=Boolean(job?.status==='Ready'&&job.validation?.blockingErrorCount===0&&!submitting)

  return <KbPageShell>
    <PageHeader title='HelpJuice Migration' subtitle='Validate one HelpJuice package, then run a resumable server-side migration job.' actions={<Stack direction='row' spacing={2}><Button variant='outlined' startIcon={<RotateCcw size={18}/>} disabled={importRunning||submitting} onClick={reset}>Reset</Button><Button variant='contained' startIcon={<PackageCheck size={18}/>} disabled={!canValidate} onClick={()=>void validate()}>Validate package</Button></Stack>}/>

    {messages.length>0&&<Alert severity='error'><AlertTitle>Migration request could not be completed</AlertTitle><List dense disablePadding>{messages.map(message=><ListItem key={message} disablePadding><ListItemText primary={message}/></ListItem>)}</List></Alert>}

    <KbSectionCard title='1. Select export package' description='Choose a full backup ZIP, or select the CSV and media files together. Files are uploaded only when validation starts.'>
      <Stack spacing={3}>
        <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
          <Button component='label' variant='outlined' startIcon={<FileArchive size={18}/>} disabled={importRunning||submitting}>Choose backup ZIP<input hidden type='file' accept='.zip,application/zip' onChange={onFiles}/></Button>
          <Button component='label' variant='outlined' startIcon={<FolderOpen size={18}/>} disabled={importRunning||submitting}>Choose CSV/media files<input hidden type='file' multiple onChange={onFiles}/></Button>
        </Stack>
        <Typography color='text.primary' sx={{fontWeight:600}}>{files.length?`${files.length} file${files.length===1?'':'s'} selected`:'No migration package selected'}</Typography>
        {previewing&&<LinearProgress/>}
        {preview&&<Stack spacing={2}>
          <Stack direction='row' spacing={1} useFlexGap sx={{flexWrap:'wrap'}}>{preview.files.slice(0,30).map(file=><Chip key={file} size='small' icon={<FileSpreadsheet size={14}/>} label={file}/>)}</Stack>
          {preview.missingRequired.length>0&&<Alert severity='error'>Missing required files: {preview.missingRequired.join(', ')}</Alert>}
          {preview.unsupported.length>0&&<Alert severity='warning'>Unsupported files: {preview.unsupported.join(', ')}</Alert>}
        </Stack>}
      </Stack>
    </KbSectionCard>

    {preview&&<KbSectionCard title='Client-side preview' description='This browser preview is informational; the backend repeats all parsing and validation authoritatively.'>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(5,1fr)'},gap:3}}>
        <Metric label='Articles' value={preview.totalArticles}/><Metric label='Published' value={preview.published}/><Metric label='Unpublished' value={preview.unpublished}/><Metric label='Categories' value={preview.categoryCount}/><Metric label='Category depth' value={preview.categoryDepth}/>
        <Metric label='Missing answers' value={preview.missingAnswers} warn/><Metric label='Duplicate IDs' value={preview.duplicateIds} warn/><Metric label='Duplicate slugs' value={preview.duplicateSlugs} warn/><Metric label='Invalid categories' value={preview.invalidCategoryReferences} warn/><Metric label='Unresolved media' value={preview.unresolvedMedia} warn/>
      </Box>
    </KbSectionCard>}

    <KbSectionCard title='2. Migration options' description='Options are captured with the job and revalidated before import.'>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,1fr)'},gap:4}}>
        <Stack><Option label='Import published articles' checked={options.importPublished} onChange={value=>setOptions({...options,importPublished:value})}/><Option label='Import unpublished articles as drafts' checked={options.importUnpublishedAsDrafts} onChange={value=>setOptions({...options,importUnpublishedAsDrafts:value})}/><Option label='Import categories' checked={options.importCategories} onChange={value=>setOptions({...options,importCategories:value})}/><Option label='Import media' checked={options.importMedia} onChange={value=>setOptions({...options,importMedia:value})}/><Option label='Preserve original timestamps' checked={options.preserveTimestamps} onChange={value=>setOptions({...options,preserveTimestamps:value})}/></Stack>
        <FormControl><FormLabel>Conflict behavior</FormLabel><RadioGroup value={options.conflictBehavior} onChange={event=>setOptions({...options,conflictBehavior:event.target.value as HelpJuiceMigrationOptions['conflictBehavior']})}><FormControlLabel value='Skip' control={<Radio/>} label='Skip existing records'/><FormControlLabel value='UpdateExisting' control={<Radio/>} label='Update existing records'/><FormControlLabel value='CreateCopy' control={<Radio/>} label='Create a uniquely-slugged copy'/></RadioGroup></FormControl>
      </Box>
    </KbSectionCard>

    {candidates.length>0&&<KbDataTable ariaLabel='HelpJuice answer migration preview' rows={candidates.slice(0,50)} columns={candidateColumns} getRowId={row=>`${row.questionId}-${row.answerId}`} emptyState={{title:'No answer records',description:'No answers were parsed.'}}/>}

    {(submitting||job)&&<KbSectionCard title='3. Validation and migration job' description='The package is processed in phases without one request per article.'>
      <Stack spacing={3}>
        {submitting&&!job&&<><Stack direction='row' sx={{justifyContent:'space-between'}}><Typography>Uploading package</Typography><Typography>{uploadProgress}%</Typography></Stack><LinearProgress variant='determinate' value={uploadProgress}/></>}
        {job&&<>
          <Stack direction='row' spacing={2} useFlexGap sx={{alignItems:'center',flexWrap:'wrap'}}><StatusChip label={job.status} color={job.status==='Failed'?'error':job.status==='CompletedWithErrors'?'warning':job.status==='Completed'?'success':'info'}/><Typography color='text.primary' sx={{fontWeight:700}}>{job.currentPhase}</Typography><Typography variant='body2' color='text.secondary'>Job {job.id}</Typography></Stack>
          <LinearProgress variant='determinate' value={progress}/>
          <Stack direction='row' spacing={1} useFlexGap sx={{flexWrap:'wrap'}}><Chip label={`${job.processedItems}/${job.totalItems} processed`}/><Chip label={`${job.importedItems} imported`} color='success' variant='tonal'/><Chip label={`${job.updatedItems} updated`} color='info' variant='tonal'/><Chip label={`${job.skippedItems} skipped`}/><Chip label={`${job.failedItems} failed`} color={job.failedItems?'error':'default'} variant='tonal'/></Stack>
          {job.validation&&<BackendValidation summary={job.validation}/>} {job.failureMessage&&<Alert severity='error'>{job.failureCode}: {job.failureMessage}</Alert>}
          <Stack direction='row' spacing={2} useFlexGap sx={{flexWrap:'wrap'}}>{canStart&&<Button variant='contained' startIcon={<Play size={18}/>} onClick={()=>void start()}>Start import</Button>}{(importRunning||submitting)&&<Button color='error' variant='outlined' startIcon={<Ban size={18}/>} onClick={()=>void cancel()}>{job?.cancellationRequested?'Cancellation requested':'Cancel'}</Button>}{TERMINAL.has(job.status)&&<><Button variant='outlined' startIcon={<Download size={18}/>} onClick={()=>void download('csv')}>Error CSV</Button><Button variant='outlined' startIcon={<Download size={18}/>} onClick={()=>void download('json')}>Error JSON</Button></>}</Stack>
        </>}
      </Stack>
    </KbSectionCard>}

    {job?.issues.length?<KbDataTable ariaLabel='Migration row errors' rows={job.issues} columns={issueColumns} getRowId={issue=>issue.id} emptyState={{title:'No row issues',description:'No row-level errors or warnings were reported.'}}/>:null}
    {job?.result&&<KbSectionCard title='Final migration result' description='Successful records remain committed even when other rows failed.'><Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(4,1fr)'},gap:3}}><Metric label='Published articles' value={job.result.publishedImported}/><Metric label='Draft articles' value={job.result.draftImported}/><Metric label='Categories imported' value={job.result.categoryImported}/><Metric label='Categories updated' value={job.result.categoryUpdated}/><Metric label='Media imported' value={job.result.mediaImported}/><Metric label='Media reused' value={job.result.mediaReused}/><Metric label='Warnings' value={job.result.warningCount} warn/><Metric label='Unresolved media' value={job.result.unresolvedMedia} warn/></Box></KbSectionCard>}
  </KbPageShell>
}

const Metric=({label,value,warn=false}:{label:string;value:number;warn?:boolean})=><Box><Typography variant='h5' color={warn&&value?'warning.main':'text.primary'} sx={{fontWeight:800}}>{value.toLocaleString()}</Typography><Typography variant='caption' color='text.secondary' sx={{textTransform:'uppercase',fontWeight:700}}>{label}</Typography></Box>
const Option=({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void})=><FormControlLabel control={<Switch checked={checked} onChange={event=>onChange(event.target.checked)}/>} label={label}/>
const BackendValidation=({summary}:{summary:NonNullable<HelpJuiceMigrationJob['validation']>})=><Alert severity={summary.blockingErrorCount?'error':summary.warningCount?'warning':'success'} icon={<ShieldCheck size={20}/>}><AlertTitle>{summary.blockingErrorCount?'Blocking validation errors':summary.warningCount?'Validated with warnings':'Package is ready'}</AlertTitle>{summary.blockingErrorCount} blocking errors and {summary.warningCount} warnings. {summary.missingRequiredFiles.length?`Missing: ${summary.missingRequiredFiles.join(', ')}.`:''}</Alert>
const issueColumns:Array<KbDataTableColumn<MigrationIssue>>=[{id:'severity',label:'Severity',render:issue=><StatusChip label={issue.severity} color={issue.severity==='Error'?'error':'warning'}/>},{id:'source',label:'Source',render:issue=><Typography variant='body2'>{issue.fileName??issue.externalEntityType??'-'}{issue.rowNumber?` row ${issue.rowNumber}`:''}</Typography>},{id:'code',label:'Code',render:issue=><Typography variant='body2' sx={{fontFamily:'monospace'}}>{issue.errorCode}</Typography>},{id:'message',label:'Message',render:issue=><Typography variant='body2'>{issue.message}</Typography>}]

export default HelpJuiceMigrationPage
