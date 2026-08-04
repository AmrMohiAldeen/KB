'use client'

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
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
import { Ban, Download, FileArchive, FileSpreadsheet, FolderOpen, PackageCheck, RotateCcw, ShieldCheck } from 'lucide-react'

import { KbPageShell, KbSectionCard } from '@/views/shared'
import KbWorkflowDialog from '@/views/shared/dialogs/KbWorkflowDialog'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import PageHeader from '../../shared/components/PageHeader'
import StatusChip from '../../shared/components/StatusChip'
import { describeApiError } from '@/lib/api/http'
import { helpJuiceMigrationsApi, type HelpJuiceMigrationOptions, type HelpJuiceMigrationResponse,
  type HelpJuiceMigrationsApi, type MigrationIssue } from '@/lib/api/helpJuiceMigrationsApi'
import { previewHelpJuiceFiles, type ClientPackagePreview } from './clientPreview'
import type { AnswerMigrationReviewRecord } from './types'

const defaultOptions: HelpJuiceMigrationOptions = { importPublished:true, importUnpublishedAsDrafts:true,
  importCategories:true, importMedia:true, preserveTimestamps:true, conflictBehavior:'Skip' }

export type HelpJuiceMigrationPageProps = { accessToken: string; api?: HelpJuiceMigrationsApi }

const HelpJuiceMigrationPage = ({ accessToken, api = helpJuiceMigrationsApi }: HelpJuiceMigrationPageProps) => {
  const [files,setFiles]=useState<File[]>([]); const [preview,setPreview]=useState<ClientPackagePreview>()
  const [previewing,setPreviewing]=useState(false); const [messages,setMessages]=useState<string[]>(accessToken?[]:['Authentication is required.'])
  const [options,setOptions]=useState(defaultOptions); const [result,setResult]=useState<HelpJuiceMigrationResponse>()
  const [confirmOpen,setConfirmOpen]=useState(false); const [submitting,setSubmitting]=useState(false)
  const [uploadProgress,setUploadProgress]=useState(0); const requestCancel=useRef<(()=>void)|undefined>(undefined)

  const selectFiles=useCallback(async(selected:File[])=>{setFiles(selected);setPreview(undefined);setResult(undefined);setMessages([]);if(!selected.length)return;setPreviewing(true);try{setPreview(await previewHelpJuiceFiles(selected))}catch(error){setMessages([error instanceof Error?error.message:'The package could not be previewed.'])}finally{setPreviewing(false)}},[])
  const onFiles=(event:ChangeEvent<HTMLInputElement>)=>{void selectFiles(Array.from(event.currentTarget.files??[]));event.currentTarget.value=''}
  const run=async()=>{if(submitting||!files.length)return;setConfirmOpen(false);setSubmitting(true);setResult(undefined);setMessages([]);setUploadProgress(0);const request=api.run(files,options,accessToken,setUploadProgress);requestCancel.current=request.cancel;try{setResult(await request.promise)}catch(error){if(error instanceof DOMException&&error.name==='AbortError')setMessages(['Migration request cancelled. Records committed before cancellation may remain; review destination content before retrying.']);else setMessages(describeApiError(error))}finally{requestCancel.current=undefined;setSubmitting(false)}}
  const cancel=()=>requestCancel.current?.()
  const reset=()=>{requestCancel.current?.();setFiles([]);setPreview(undefined);setResult(undefined);setMessages([]);setUploadProgress(0);setOptions(defaultOptions);setConfirmOpen(false)}
  const download=(format:'csv'|'json')=>{if(!result)return;const content=format==='json'?JSON.stringify(result.issues,null,2):issuesCsv(result.issues);const blob=new Blob([content],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`helpjuice-migration-errors.${format}`;link.click();URL.revokeObjectURL(url)}

  const candidates=preview?.build?.answerResults??[]
  const candidateColumns=useMemo<Array<KbDataTableColumn<AnswerMigrationReviewRecord>>>(()=>[
    {id:'article',label:'Article',render:item=><Box><Typography color='text.primary' sx={{fontWeight:700}}>{item.title||'Untitled article'}</Typography><Typography variant='body2' color='text.secondary'>Question {item.questionId} / Answer {item.answerId}</Typography></Box>},
    {id:'status',label:'Conversion',render:item=><StatusChip label={item.status} color={item.status==='failed'?'error':item.status==='warning'?'warning':'success'}/>},
    {id:'content',label:'Content',render:item=><Typography variant='body2'>{item.outputTextLength.toLocaleString()} text characters</Typography>},
    {id:'warnings',label:'Warnings',render:item=><Chip size='small' label={item.warnings.length} color={item.warnings.length?'warning':'default'} variant='tonal'/>}
  ],[])
  const isZip=files.length===1&&files[0].name.toLowerCase().endsWith('.zip')
  const canImport=Boolean(accessToken&&files.length&&preview&&!preview.missingRequired.length&&(isZip||!preview.unsupported.length)&&!submitting)

  return <KbPageShell>
    <PageHeader title='HelpJuice Migration' subtitle='Preview locally, confirm once, then keep the request open while the backend validates and imports.' actions={<Stack direction='row' spacing={2}><Button variant='outlined' startIcon={<RotateCcw size={18}/>} disabled={submitting} onClick={reset}>Reset</Button><Button variant='contained' startIcon={<PackageCheck size={18}/>} disabled={!canImport} onClick={()=>setConfirmOpen(true)}>Review and import</Button></Stack>}/>

    {messages.length>0&&<Alert severity='error'><AlertTitle>Migration request could not be completed</AlertTitle><List dense disablePadding>{messages.map(message=><ListItem key={message} disablePadding><ListItemText primary={message}/></ListItem>)}</List></Alert>}

    <KbSectionCard title='1. Select export package' description='Choose a full backup ZIP, or select the CSV and media files together. Nothing is uploaded until you confirm.'>
      <Stack spacing={3}><Stack direction={{xs:'column',sm:'row'}} spacing={2}>
        <Button component='label' variant='outlined' startIcon={<FileArchive size={18}/>} disabled={submitting}>Choose backup ZIP<input hidden type='file' accept='.zip,application/zip' onChange={onFiles}/></Button>
        <Button component='label' variant='outlined' startIcon={<FolderOpen size={18}/>} disabled={submitting}>Choose CSV/media files<input hidden type='file' multiple onChange={onFiles}/></Button>
      </Stack><Typography color='text.primary' sx={{fontWeight:600}}>{files.length?`${files.length} file${files.length===1?'':'s'} selected`:'No migration package selected'}</Typography>
      {previewing&&<LinearProgress/>}{preview&&<Stack spacing={2}><Stack direction='row' spacing={1} useFlexGap sx={{flexWrap:'wrap'}}>{preview.files.slice(0,30).map(file=><Chip key={file} size='small' icon={<FileSpreadsheet size={14}/>} label={file}/>)}</Stack>{preview.missingRequired.length>0&&<Alert severity='error'>Missing required files: {preview.missingRequired.join(', ')}</Alert>}{preview.unsupported.length>0&&<Alert severity='warning'>Unsupported files: {preview.unsupported.join(', ')}</Alert>}</Stack>}</Stack>
    </KbSectionCard>

    {preview&&<KbSectionCard title='Client-side preview' description='This preview is informational and uses at most the first 100 data rows from each CSV. The confirmed request repeats parsing and validation authoritatively before changing data.'><Stack spacing={3}><Alert severity='warning'>Preview limited to the first 100 rows. The complete file will still be processed.</Alert><Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(5,1fr)'},gap:3}}><Metric label='Articles' value={preview.totalArticles}/><Metric label='Published' value={preview.published}/><Metric label='Unpublished' value={preview.unpublished}/><Metric label='Categories' value={preview.categoryCount}/><Metric label='Category depth' value={preview.categoryDepth}/><Metric label='Missing answers' value={preview.missingAnswers} warn/><Metric label='Duplicate IDs' value={preview.duplicateIds} warn/><Metric label='Duplicate slugs' value={preview.duplicateSlugs} warn/><Metric label='Invalid categories' value={preview.invalidCategoryReferences} warn/><Metric label='Unresolved media' value={preview.unresolvedMedia} warn/></Box></Stack></KbSectionCard>}

    <KbSectionCard title='2. Migration options' description='Conflict handling uses the existing destination article and category data; no external-ID mapping is retained.'><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,1fr)'},gap:4}}><Stack><Option label='Import published articles' checked={options.importPublished} onChange={value=>setOptions({...options,importPublished:value})}/><Option label='Import unpublished articles as drafts' checked={options.importUnpublishedAsDrafts} onChange={value=>setOptions({...options,importUnpublishedAsDrafts:value})}/><Option label='Import categories' checked={options.importCategories} onChange={value=>setOptions({...options,importCategories:value})}/><Option label='Import media' checked={options.importMedia} onChange={value=>setOptions({...options,importMedia:value})}/><Option label='Preserve original timestamps' checked={options.preserveTimestamps} onChange={value=>setOptions({...options,preserveTimestamps:value})}/></Stack><FormControl><FormLabel>Conflict behavior</FormLabel><RadioGroup value={options.conflictBehavior} onChange={event=>setOptions({...options,conflictBehavior:event.target.value as HelpJuiceMigrationOptions['conflictBehavior']})}><FormControlLabel value='Skip' control={<Radio/>} label='Skip existing records'/><FormControlLabel value='UpdateExisting' control={<Radio/>} label='Update existing records'/><FormControlLabel value='CreateCopy' control={<Radio/>} label='Create a uniquely-slugged copy'/></RadioGroup></FormControl></Box></KbSectionCard>

    {candidates.length>0&&<KbDataTable ariaLabel='HelpJuice answer migration preview' rows={candidates.slice(0,50)} columns={candidateColumns} getRowId={row=>`${row.questionId}-${row.answerId}`} emptyState={{title:'No answer records',description:'No answers were parsed.'}}/>}

    {submitting&&<KbSectionCard title='3. Backend validation and import' description='Keep this page open. Cancelling aborts the request, but records committed at an earlier article boundary remain.'><Stack spacing={3}><Stack direction='row' sx={{justifyContent:'space-between'}}><Typography>{uploadProgress<100?'Uploading package':'Backend is validating and importing'}</Typography><Typography>{uploadProgress<100?`${uploadProgress}%`:'Processing'}</Typography></Stack><LinearProgress variant={uploadProgress<100?'determinate':'indeterminate'} value={uploadProgress}/><Button color='error' variant='outlined' startIcon={<Ban size={18}/>} onClick={cancel}>Cancel request</Button></Stack></KbSectionCard>}

    {result&&<><KbSectionCard title='3. Migration result' description='Validation, progress, and row issues below came from this request and are not stored as migration-job records.'><Stack spacing={3}><Stack direction='row' spacing={2} useFlexGap sx={{alignItems:'center',flexWrap:'wrap'}}><StatusChip label={result.status} color={result.status==='Completed'?'success':result.status==='CompletedWithErrors'?'warning':'error'}/><Typography variant='body2' color='text.secondary'>{result.originalFileName}</Typography></Stack><BackendValidation summary={result.validation}/><Stack spacing={1}>{result.phases.map(phase=><Box key={phase.phase}><Stack direction='row' sx={{justifyContent:'space-between'}}><Typography sx={{fontWeight:700}}>{phase.phase}</Typography><Typography variant='body2'>{phase.processedItems}/{phase.totalItems} · {phase.importedItems} imported · {phase.updatedItems} updated · {phase.skippedItems} skipped · {phase.failedItems} failed</Typography></Stack><LinearProgress variant='determinate' value={phase.totalItems?Math.min(100,phase.processedItems/phase.totalItems*100):100}/></Box>)}</Stack>{result.result&&<Box sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,1fr)',md:'repeat(4,1fr)'},gap:3}}><Metric label='Imported' value={result.result.importedItems}/><Metric label='Updated' value={result.result.updatedItems}/><Metric label='Skipped' value={result.result.skippedItems}/><Metric label='Failed' value={result.result.failedItems} warn/><Metric label='Published articles' value={result.result.publishedImported}/><Metric label='Draft articles' value={result.result.draftImported}/><Metric label='Media imported' value={result.result.mediaImported}/><Metric label='Warnings' value={result.result.warningCount} warn/></Box>}<Stack direction='row' spacing={2}><Button variant='outlined' startIcon={<Download size={18}/>} onClick={()=>download('csv')}>Error CSV</Button><Button variant='outlined' startIcon={<Download size={18}/>} onClick={()=>download('json')}>Error JSON</Button></Stack></Stack></KbSectionCard>{result.issues.length>0&&<KbDataTable ariaLabel='Migration row errors' rows={result.issues} columns={issueColumns} getRowId={issue=>issue.id} emptyState={{title:'No row issues',description:'No row-level errors or warnings were reported.'}}/>}</>}

    <KbWorkflowDialog open={confirmOpen} title='Confirm HelpJuice migration' description={`The backend will validate and import the complete selected package in one request using ${options.conflictBehavior} conflict handling.`} notice='This synchronous operation can take a long time. Do not close the page; cancellation may leave already committed records in place.' confirmLabel='Start migration' onClose={()=>setConfirmOpen(false)} onConfirm={()=>void run()}><Stack spacing={1}><Typography>{options.importPublished?'Published articles included':'Published articles excluded'}</Typography><Typography>{options.importUnpublishedAsDrafts?'Unpublished articles imported as drafts':'Unpublished articles excluded'}</Typography><Typography>{options.importCategories?'Categories included':'Categories excluded'} · {options.importMedia?'Media included':'Media excluded'}</Typography></Stack></KbWorkflowDialog>
  </KbPageShell>
}

const issuesCsv=(issues:MigrationIssue[])=>['severity,fileName,rowNumber,externalEntityType,externalId,errorCode,message,sourceDataSummary,createdAt',...issues.map(issue=>[issue.severity,issue.fileName,issue.rowNumber,issue.externalEntityType,issue.externalId,issue.errorCode,issue.message,issue.sourceDataSummary,issue.createdAt].map(csvCell).join(','))].join('\r\n')
const csvCell=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`
const Metric=({label,value,warn=false}:{label:string;value:number;warn?:boolean})=><Box><Typography variant='h5' color={warn&&value?'warning.main':'text.primary'} sx={{fontWeight:800}}>{value.toLocaleString()}</Typography><Typography variant='caption' color='text.secondary' sx={{textTransform:'uppercase',fontWeight:700}}>{label}</Typography></Box>
const Option=({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void})=><FormControlLabel control={<Switch checked={checked} onChange={event=>onChange(event.target.checked)}/>} label={label}/>
const BackendValidation=({summary}:{summary:HelpJuiceMigrationResponse['validation']})=><Alert severity={summary.blockingErrorCount?'error':summary.warningCount?'warning':'success'} icon={<ShieldCheck size={20}/>}><AlertTitle>{summary.blockingErrorCount?'Blocking validation errors':summary.warningCount?'Validated with warnings':'Authoritative validation passed'}</AlertTitle>{summary.blockingErrorCount} blocking errors and {summary.warningCount} warnings. {summary.missingRequiredFiles.length?`Missing: ${summary.missingRequiredFiles.join(', ')}.`:''}</Alert>
const issueColumns:Array<KbDataTableColumn<MigrationIssue>>=[{id:'severity',label:'Severity',render:issue=><StatusChip label={issue.severity} color={issue.severity==='Error'?'error':'warning'}/>},{id:'source',label:'Source',render:issue=><Typography variant='body2'>{issue.fileName??issue.externalEntityType??'-'}{issue.rowNumber?` row ${issue.rowNumber}`:''}</Typography>},{id:'code',label:'Code',render:issue=><Typography variant='body2' sx={{fontFamily:'monospace'}}>{issue.errorCode}</Typography>},{id:'message',label:'Message',render:issue=><Typography variant='body2'>{issue.message}</Typography>}]

export default HelpJuiceMigrationPage
