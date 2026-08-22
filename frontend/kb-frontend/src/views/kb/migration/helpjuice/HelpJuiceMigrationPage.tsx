'use client'

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { Ban, ChevronDown, Download, Eye, FileArchive, FileSpreadsheet, FolderOpen, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react'

import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'
import { describeApiError } from '@/lib/api/http'
import {
  helpJuiceMigrationsApi,
  type HelpJuiceDiagnosticDownload,
  type HelpJuiceMigrationOptions,
  type HelpJuiceMigrationPreviewArticle,
  type HelpJuiceMigrationResponse,
  type HelpJuiceMigrationsApi,
  type HelpJuiceUserMigrationResponse,
  type MigrationIssue
} from '@/lib/api/helpJuiceMigrationsApi'
import { KbPageShell, KbSectionCard } from '@/views/shared'
import KbWorkflowDialog from '@/views/shared/dialogs/KbWorkflowDialog'
import KbDataTable, { type KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import PageHeader from '../../shared/components/PageHeader'
import StatusChip from '../../shared/components/StatusChip'

const defaultOptions: HelpJuiceMigrationOptions = {
  importPublished: true,
  importUnpublishedAsDrafts: true,
  importCategories: true,
  importMedia: true,
  preserveTimestamps: true,
  conflictBehavior: 'Skip'
}

export type HelpJuiceMigrationPageProps = { accessToken: string; api?: HelpJuiceMigrationsApi }

const HelpJuiceMigrationPage = ({ accessToken, api = helpJuiceMigrationsApi }: HelpJuiceMigrationPageProps) => {
  const [usersFile, setUsersFile] = useState<File>()
  const [usersResult, setUsersResult] = useState<HelpJuiceUserMigrationResponse>()
  const [usersMessages, setUsersMessages] = useState<string[]>([])
  const [usersConfirmOpen, setUsersConfirmOpen] = useState(false)
  const [usersSubmitting, setUsersSubmitting] = useState(false)
  const [usersProgress, setUsersProgress] = useState(0)
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<Awaited<ReturnType<HelpJuiceMigrationsApi['preview']>>>()
  const [selectedArticle, setSelectedArticle] = useState<HelpJuiceMigrationPreviewArticle>()
  const [previewing, setPreviewing] = useState(false)
  const [messages, setMessages] = useState<string[]>(accessToken ? [] : ['Authentication is required.'])
  const [options, setOptions] = useState(defaultOptions)
  const [result, setResult] = useState<HelpJuiceMigrationResponse>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosticProgress, setDiagnosticProgress] = useState(0)
  const [diagnosticScanning, setDiagnosticScanning] = useState(false)
  const [diagnosticReport, setDiagnosticReport] = useState<HelpJuiceDiagnosticDownload>()
  const usersRequestCancel = useRef<(() => void) | undefined>(undefined)
  const requestCancel = useRef<(() => void) | undefined>(undefined)
  const diagnosticCancel = useRef<(() => void) | undefined>(undefined)
  const previewSequence = useRef(0)

  const onUsersFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    setUsersResult(undefined)
    setUsersMessages([])
    if (!file) { setUsersFile(undefined); return }
    if (file.name.toLowerCase() !== 'users.csv') {
      setUsersFile(undefined)
      setUsersMessages(['Choose the HelpJuice users.csv file.'])
      return
    }
    setUsersFile(file)
  }
  const runUsers = async () => {
    if (usersSubmitting || submitting || diagnosing || previewing || !usersFile) return
    setUsersConfirmOpen(false); setUsersSubmitting(true); setUsersResult(undefined); setUsersMessages([]); setUsersProgress(0)
    const request = api.runUsers(usersFile, accessToken, setUsersProgress)
    usersRequestCancel.current = request.cancel
    try {
      setUsersResult(await request.promise)
      previewSequence.current += 1
      setFiles([]); setPreview(undefined); setSelectedArticle(undefined); setResult(undefined)
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setUsersMessages(['Users migration cancelled. Users committed before cancellation may remain; rerun users.csv safely to reconcile them.'])
      else setUsersMessages(describeApiError(error))
    } finally { usersRequestCancel.current = undefined; setUsersSubmitting(false) }
  }
  const resetUsers = () => {
    usersRequestCancel.current?.()
    setUsersFile(undefined); setUsersResult(undefined); setUsersMessages([]); setUsersProgress(0)
    setUsersConfirmOpen(false); setUsersSubmitting(false)
  }

  const selectFiles = useCallback(async (selected: File[]) => {
    const sequence = ++previewSequence.current
    setFiles(selected)
    setPreview(undefined)
    setSelectedArticle(undefined)
    setResult(undefined)
    setDiagnosticReport(undefined)
    setMessages([])
    if (!selected.length) return
    if (!accessToken) { setMessages(['Authentication is required to generate a migration preview.']); return }
    setPreviewing(true)
    try {
      const nextPreview = await api.preview(selected, accessToken)
      if (sequence === previewSequence.current) setPreview(nextPreview)
    } catch (error) {
      if (sequence === previewSequence.current) setMessages(describeApiError(error))
    } finally {
      if (sequence === previewSequence.current) setPreviewing(false)
    }
  }, [accessToken, api])

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    void selectFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }
  const run = async () => {
    if (submitting || usersSubmitting || !files.length) return
    setConfirmOpen(false); setSubmitting(true); setResult(undefined); setMessages([]); setUploadProgress(0)
    const request = api.run(files, options, accessToken, setUploadProgress)
    requestCancel.current = request.cancel
    try { setResult(await request.promise) }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessages(['Migration request cancelled. Records committed before cancellation may remain; review destination content before retrying.'])
      else setMessages(describeApiError(error))
    } finally { requestCancel.current = undefined; setSubmitting(false) }
  }
  const runDiagnostic = async () => {
    if (diagnosing || submitting || !files.length) return
    setDiagnosing(true); setDiagnosticProgress(0); setDiagnosticScanning(false); setDiagnosticReport(undefined); setMessages([])
    const request = api.diagnostic(files, accessToken, setDiagnosticProgress, () => setDiagnosticScanning(true))
    diagnosticCancel.current = request.cancel
    try {
      const report = await request.promise
      setDiagnosticReport(report)
      downloadDiagnostic(report)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessages(['Full diagnostic scan cancelled. No migration records were changed.'])
      else setMessages(describeApiError(error))
    } finally {
      diagnosticCancel.current = undefined; setDiagnosing(false); setDiagnosticScanning(false)
    }
  }
  const reset = () => {
    requestCancel.current?.(); diagnosticCancel.current?.(); previewSequence.current += 1; setFiles([]); setPreview(undefined)
    setSelectedArticle(undefined); setResult(undefined); setMessages([]); setUploadProgress(0)
    setDiagnosticReport(undefined); setDiagnosticProgress(0); setDiagnosticScanning(false); setDiagnosing(false)
    setOptions(defaultOptions); setConfirmOpen(false); setPreviewing(false)
  }
  const downloadIssues = (issues: MigrationIssue[], fileStem: string, format: 'csv' | 'json') => {
    const content = format === 'json' ? JSON.stringify(issues, null, 2) : issuesCsv(issues)
    const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `${fileStem}.${format}`; link.click(); URL.revokeObjectURL(url)
  }

  const articleColumns = useMemo<Array<KbDataTableColumn<HelpJuiceMigrationPreviewArticle>>>(() => [
    { id: 'article', label: 'Article', render: article => <Box><Typography color='text.primary' sx={{ fontWeight: 700 }}>{article.title || 'Untitled article'}</Typography><Typography variant='body2' color='text.secondary'>questions.csv row {article.questionRowNumber} · ID {article.externalId}</Typography></Box> },
    { id: 'location', label: 'Category / location', render: article => <Typography variant='body2'>{article.categoryLocation || 'Uncategorized'}</Typography> },
    { id: 'visibility', label: 'Visibility', render: article => <StatusChip label={article.visibility} color={article.visibility === 'Internal' ? 'warning' : 'success'} /> },
    { id: 'state', label: 'Import state', render: article => <StatusChip label={article.isArchived ? 'Archived' : article.isPublished ? 'Published' : 'Draft'} color={article.isArchived ? 'secondary' : article.isPublished ? 'success' : 'secondary'} /> },
    { id: 'issues', label: 'Validation', render: article => <ArticleIssueStatus issues={article.issues} /> },
    { id: 'view', label: 'Actions', align: 'right', render: article => <Button size='small' variant='outlined' startIcon={<Eye size={16} />} onClick={() => setSelectedArticle(article)}>View article</Button> }
  ], [])

  const previewIssues = Array.from(new Map(
    (preview?.articles.flatMap(article => article.issues) ?? []).map(issue => [issue.id, issue])
  ).values())
  const previewErrors = previewIssues.filter(issue => issue.severity === 'Error').length
  const previewWarnings = previewIssues.filter(issue => issue.severity === 'Warning').length
  const packageErrors = preview?.packageIssues.some(issue => issue.severity === 'Error') ?? false
  const hasSelectedPublicationState = options.importPublished || options.importUnpublishedAsDrafts
  const canImport = Boolean(accessToken && files.length && preview && preview.articles.length &&
    hasSelectedPublicationState && !preview.missingRequiredFiles.length && !packageErrors && !previewErrors &&
    !usersSubmitting && !submitting && !diagnosing && !previewing)

  return <KbPageShell>
    <PageHeader title='HelpJuice Migration' subtitle='Migrate HelpJuice users first, then preview and migrate the exported knowledge-base content.' />

    <KbSectionCard title='1. Users Migration' description='Import HelpJuice users into existing KB users before migrating content.'>
      <Stack spacing={3}>
        <Alert severity='info'>
          The migration matches users by HelpJuice ID first, then email, and stores migration metadata only—never passwords or roles. It is safe to rerun users.csv.
        </Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button component='label' variant='outlined' startIcon={<FileSpreadsheet size={18} />} disabled={usersSubmitting || submitting || diagnosing || previewing}>
            Choose users.csv
            <input hidden type='file' accept='.csv,text/csv' onChange={onUsersFile} />
          </Button>
          <Button variant='contained' startIcon={<PackageCheck size={18} />} disabled={!accessToken || !usersFile || usersSubmitting || submitting || diagnosing || previewing} onClick={() => setUsersConfirmOpen(true)}>
            Migrate users
          </Button>
          <Button variant='text' startIcon={<RotateCcw size={18} />} disabled={usersSubmitting || (!usersFile && !usersResult)} onClick={resetUsers}>
            Reset users migration
          </Button>
        </Stack>
        <Typography color='text.primary' sx={{ fontWeight: 600 }}>{usersFile ? `${usersFile.name} selected` : 'No users.csv selected'}</Typography>
        {usersMessages.length > 0 && <Alert severity='error'><AlertTitle>Users migration could not be completed</AlertTitle><List dense disablePadding>{usersMessages.map(message => <ListItem key={message} disablePadding><ListItemText primary={message} /></ListItem>)}</List></Alert>}
        {usersSubmitting && <Stack spacing={1.5} role='status' aria-live='polite'>
          <Stack direction='row' sx={{ justifyContent: 'space-between' }}><Typography>{usersProgress < 100 ? 'Uploading users.csv' : 'Importing users into the KB'}</Typography><Typography>{usersProgress < 100 ? `${usersProgress}%` : 'Processing'}</Typography></Stack>
          <LinearProgress aria-label='Users migration progress' variant={usersProgress < 100 ? 'determinate' : 'indeterminate'} value={usersProgress} />
          <Button color='error' variant='outlined' startIcon={<Ban size={18} />} sx={{ alignSelf: 'flex-start' }} onClick={() => usersRequestCancel.current?.()}>Cancel users migration</Button>
        </Stack>}
        {usersResult && <Stack spacing={3} role='status' aria-live='polite'>
          <Stack direction='row' spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><StatusChip label={usersResult.status} color={usersResult.status === 'Completed' && !usersResult.failedUsers ? 'success' : usersResult.status === 'CompletedWithErrors' || usersResult.failedUsers ? 'warning' : 'error'} /><Typography variant='body2' color='text.secondary'>{usersResult.originalFileName}</Typography></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(5,1fr)' }, gap: 3 }}>
            <Metric label='Total rows' value={usersResult.totalRows} />
            <Metric label='Imported' value={usersResult.importedUsers} />
            <Metric label='Updated' value={usersResult.updatedUsers} />
            <Metric label='Skipped' value={usersResult.skippedUsers} />
            <Metric label='Failed' value={usersResult.failedUsers} error />
          </Box>
          <IssueSummary issues={usersResult.issues} />
          <Stack direction='row' spacing={2}>
            <Button variant='outlined' startIcon={<Download size={18} />} onClick={() => downloadIssues(usersResult.issues, 'helpjuice-users-migration-issues', 'csv')}>Issue CSV</Button>
            <Button variant='outlined' startIcon={<Download size={18} />} onClick={() => downloadIssues(usersResult.issues, 'helpjuice-users-migration-issues', 'json')}>Issue JSON</Button>
          </Stack>
          {usersResult.issues.length > 0 && <KbDataTable ariaLabel='Users migration issues' rows={usersResult.issues} columns={issueColumns} getRowId={issue => issue.id} emptyState={{ title: 'No user issues', description: 'No user row errors or warnings were reported.' }} />}
        </Stack>}
      </Stack>
    </KbSectionCard>

    <Alert severity='warning'><AlertTitle>Complete Users Migration before Content Migration</AlertTitle>Users may already have been migrated in an earlier session. If not, run Users Migration above before importing content so HelpJuice authors resolve to KB users.</Alert>

    <KbSectionCard title='2. HelpJuice Content Migration' description='Preview, diagnose, configure, and import the HelpJuice content package after users have been migrated.'>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button variant='outlined' startIcon={<RotateCcw size={18} />} disabled={usersSubmitting || submitting || diagnosing} onClick={reset}>Reset content migration</Button>
        <Button variant='contained' startIcon={<PackageCheck size={18} />} disabled={!canImport} onClick={() => setConfirmOpen(true)}>Review and migrate content</Button>
      </Stack>
    </KbSectionCard>

    {messages.length > 0 && <Alert severity='error'><AlertTitle>Content migration request could not be completed</AlertTitle><List dense disablePadding>{messages.map(message => <ListItem key={message} disablePadding><ListItemText primary={message} /></ListItem>)}</List></Alert>}

    <KbSectionCard title='2.1 Upload export package' description='Choose a backup ZIP or its CSV/media files. The files are uploaded to generate the read-only preview; no knowledge-base records are changed yet.'>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Button component='label' variant='outlined' startIcon={<FileArchive size={18} />} disabled={usersSubmitting || submitting || diagnosing || previewing}>Choose backup ZIP<input hidden type='file' accept='.zip,application/zip' onChange={onFiles} /></Button>
          <Button component='label' variant='outlined' startIcon={<FolderOpen size={18} />} disabled={usersSubmitting || submitting || diagnosing || previewing}>Choose CSV/media files<input hidden type='file' multiple onChange={onFiles} /></Button>
        </Stack>
        <Typography color='text.primary' sx={{ fontWeight: 600 }}>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'No migration package selected'}</Typography>
        {previewing && <Stack spacing={1} role='status' aria-live='polite'><Typography variant='body2' color='text.secondary'>Uploading and generating the migration preview…</Typography><LinearProgress aria-label='Content preview progress' /></Stack>}
        {preview && <Stack spacing={2}>
          <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{preview.availableFiles.slice(0, 30).map(file => <Chip key={file} size='small' icon={<FileSpreadsheet size={14} />} label={file} />)}</Stack>
          {preview.missingRequiredFiles.length > 0 && <Alert severity='error'>Missing required files: {preview.missingRequiredFiles.join(', ')}</Alert>}
          {preview.unsupportedFiles.length > 0 && <Alert severity='warning'>Unsupported files: {preview.unsupportedFiles.join(', ')}</Alert>}
          {preview.packageIssues.map(issue => <IssueAlert key={issue.id} issue={issue} />)}
        </Stack>}
        {files.length > 0 && <Box sx={{ borderTop: theme => `1px solid ${theme.palette.divider}`, pt: 3 }}>
          <Stack spacing={2}>
            <Box><Typography color='text.primary' sx={{ fontWeight: 700 }}>Full migration diagnostic</Typography><Typography variant='body2' color='text.secondary'>Run the importer&apos;s existing parsing and validation across the entire package without importing anything. Every occurrence is written to one CSV report.</Typography></Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <Button variant='outlined' startIcon={<FileSpreadsheet size={18} />} disabled={!accessToken || usersSubmitting || previewing || submitting || diagnosing} onClick={() => void runDiagnostic()}>Run full diagnostic</Button>
              {diagnosticReport && <Button variant='outlined' startIcon={<Download size={18} />} onClick={() => downloadDiagnostic(diagnosticReport)}>Download diagnostic again</Button>}
            </Stack>
            {diagnosing && <Stack spacing={1} role='status' aria-live='polite'><Stack direction='row' sx={{ justifyContent: 'space-between' }}><Typography variant='body2' color='text.secondary'>{diagnosticScanning ? 'Scanning the entire package with migration validation…' : 'Uploading package for full diagnostic…'}</Typography><Typography variant='body2'>{diagnosticScanning ? 'Processing' : `${diagnosticProgress}%`}</Typography></Stack><LinearProgress aria-label='Content diagnostic progress' variant={diagnosticScanning ? 'indeterminate' : 'determinate'} value={diagnosticProgress} /><Button color='error' variant='text' startIcon={<Ban size={16} />} sx={{ alignSelf: 'flex-start' }} onClick={() => diagnosticCancel.current?.()}>Cancel diagnostic</Button></Stack>}
            {diagnosticReport && <Alert severity={diagnosticReport.status === 'Partial' ? 'warning' : 'success'}><AlertTitle>{diagnosticReport.status === 'Partial' ? 'Partial diagnostic report downloaded' : 'Full diagnostic report downloaded'}</AlertTitle>{diagnosticReport.totalRecords === undefined ? 'The report contains the full scan summary and every collected issue.' : `${diagnosticReport.totalRecords.toLocaleString()} records scanned · ${diagnosticReport.errorCount ?? 0} errors · ${diagnosticReport.warningCount ?? 0} warnings.`}</Alert>}
          </Stack>
        </Box>}
      </Stack>
    </KbSectionCard>

    {preview && <>
      <KbSectionCard title='2.2 Review content migration preview' description='The backend uses the same parser and converter as the actual migration. Only the previewed articles and their associated row issues are returned to the browser.'>
        <Stack spacing={3}>
          <Alert severity={preview.isLimited ? 'info' : 'success'}>
            Showing {preview.articles.length.toLocaleString()} of {preview.sourceArticleCount.toLocaleString()} source articles{preview.isLimited ? ` (preview limit: ${preview.previewLimit}).` : '.'}
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(6,1fr)' }, gap: 3 }}>
            <Metric label='Previewed' value={preview.articles.length} />
            <Metric label='Published' value={preview.articles.filter(article => article.isPublished).length} />
            <Metric label='Drafts' value={preview.articles.filter(article => !article.isPublished).length} />
            <Metric label='Source categories' value={preview.sourceCategoryCount} />
            <Metric label='Warnings' value={previewWarnings} warn />
            <Metric label='Errors' value={previewErrors} error />
          </Box>
        </Stack>
      </KbSectionCard>
      <KbDataTable ariaLabel='HelpJuice article migration preview' rows={preview.articles} columns={articleColumns} getRowId={article => `${article.externalId}-${article.questionRowNumber}`} emptyState={{ title: 'No preview articles', description: 'No valid question rows were available to preview.' }} />
    </>}

    <KbSectionCard title='2.3 Content migration options' description='Stable HelpJuice external-ID mappings make retries resumable and prevent duplicate destination records.'>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' }, gap: 4 }}>
        <Stack><Option label='Import published articles' checked={options.importPublished} onChange={value => setOptions({ ...options, importPublished: value })} /><Option label='Import unpublished articles as drafts' checked={options.importUnpublishedAsDrafts} onChange={value => setOptions({ ...options, importUnpublishedAsDrafts: value })} /><Option label='Import categories' checked={options.importCategories} onChange={value => setOptions({ ...options, importCategories: value })} /><Option label='Import media' checked={options.importMedia} onChange={value => setOptions({ ...options, importMedia: value })} /><Option label='Preserve original timestamps' checked={options.preserveTimestamps} onChange={value => setOptions({ ...options, preserveTimestamps: value })} /></Stack>
        <FormControl><FormLabel id='helpjuice-conflict-behavior-label'>Conflict behavior</FormLabel><RadioGroup aria-labelledby='helpjuice-conflict-behavior-label' value={options.conflictBehavior} onChange={event => setOptions({ ...options, conflictBehavior: event.target.value as HelpJuiceMigrationOptions['conflictBehavior'] })}><FormControlLabel value='Skip' control={<Radio />} label='Skip existing records' /><FormControlLabel value='UpdateExisting' control={<Radio />} label='Update existing records' /><FormControlLabel value='CreateCopy' control={<Radio />} label='Create a uniquely-slugged copy' /></RadioGroup></FormControl>
      </Box>
      {!hasSelectedPublicationState && <Alert severity='error' sx={{ mt: 3 }}>Select at least one article publication state before migrating content.</Alert>}
    </KbSectionCard>

    {submitting && <KbSectionCard title='2.4 Backend content validation and import' description='Keep this page open. Cancelling aborts the request, but records committed at an earlier article boundary remain.'><Stack spacing={3} role='status' aria-live='polite'><Stack direction='row' sx={{ justifyContent: 'space-between' }}><Typography>{uploadProgress < 100 ? 'Uploading content package' : 'Backend is validating and importing content'}</Typography><Typography>{uploadProgress < 100 ? `${uploadProgress}%` : 'Processing'}</Typography></Stack><LinearProgress aria-label='Content migration progress' variant={uploadProgress < 100 ? 'determinate' : 'indeterminate'} value={uploadProgress} /><Button color='error' variant='outlined' startIcon={<Ban size={18} />} onClick={() => requestCancel.current?.()}>Cancel content migration</Button></Stack></KbSectionCard>}

    {result && <><KbSectionCard title='2.4 Content migration result' description='The complete package was validated again before records were changed.'><Stack spacing={3} role='status' aria-live='polite'><Stack direction='row' spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><StatusChip label={result.status} color={result.status === 'Completed' ? 'success' : result.status === 'CompletedWithErrors' ? 'warning' : 'error'} /><Typography variant='body2' color='text.secondary'>{result.originalFileName}</Typography></Stack><BackendValidation summary={result.validation} /><Stack spacing={1}>{result.phases.map(phase => <Box key={phase.phase}><Stack direction='row' sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontWeight: 700 }}>{phase.phase}</Typography><Typography variant='body2'>{phase.processedItems}/{phase.totalItems} · {phase.importedItems} imported · {phase.updatedItems} updated · {phase.skippedItems} skipped · {phase.failedItems} failed</Typography></Stack><LinearProgress aria-label={`${phase.phase} migration phase progress`} variant='determinate' value={phase.totalItems ? Math.min(100, phase.processedItems / phase.totalItems * 100) : 100} /></Box>)}</Stack>{result.result && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 3 }}><Metric label='Imported' value={result.result.importedItems} /><Metric label='Updated' value={result.result.updatedItems} /><Metric label='Skipped' value={result.result.skippedItems} /><Metric label='Failed' value={result.result.failedItems} error /><Metric label='Published articles' value={result.result.publishedImported} /><Metric label='Draft articles' value={result.result.draftImported} /><Metric label='Media imported' value={result.result.mediaImported} /><Metric label='Warnings' value={result.result.warningCount} warn /></Box>}<Stack direction='row' spacing={2}><Button variant='outlined' startIcon={<Download size={18} />} onClick={() => downloadIssues(result.issues, 'helpjuice-content-migration-issues', 'csv')}>Issue CSV</Button><Button variant='outlined' startIcon={<Download size={18} />} onClick={() => downloadIssues(result.issues, 'helpjuice-content-migration-issues', 'json')}>Issue JSON</Button></Stack></Stack></KbSectionCard>{result.issues.length > 0 && <KbDataTable ariaLabel='Content migration row issues' rows={result.issues} columns={issueColumns} getRowId={issue => issue.id} emptyState={{ title: 'No row issues', description: 'No row-level errors or warnings were reported.' }} />}</>}

    {result && <KbSectionCard title='2.5 Content reconciliation and issue summary' description={`Persistent migration job ${result.jobId} groups final states, warnings, and errors for reconciliation and retry.`}><Stack spacing={2}>{result.result && <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}><Chip color='success' label={`Published: ${result.result.publishedImported}`} /><Chip color='secondary' label={`Draft: ${result.result.draftImported}`} /><Chip color='warning' label={`Archived: ${result.result.archivedImported}`} /></Stack>}<IssueSummary issues={result.issues} /></Stack></KbSectionCard>}
    <ArticlePreviewDialog article={selectedArticle} onClose={() => setSelectedArticle(undefined)} />
    <KbWorkflowDialog open={usersConfirmOpen} title='Confirm Users Migration' description='Import users.csv into existing KB users, matching HelpJuice ID first and email second.' notice='Only HelpJuice migration metadata is stored; passwords and roles are never imported. The migration is safe to rerun.' confirmLabel='Start users migration' onClose={() => setUsersConfirmOpen(false)} onConfirm={() => void runUsers()} />
    <KbWorkflowDialog open={confirmOpen} title='Confirm HelpJuice Content Migration' description={`Users Migration must be completed before Content Migration. The backend will validate the complete package again, then import content using ${options.conflictBehavior} conflict handling.`} notice='This synchronous operation can take a long time. Do not close the page; cancellation may leave already committed content records in place.' confirmLabel='Start content migration' onClose={() => setConfirmOpen(false)} onConfirm={() => void run()}><Stack spacing={1}><Typography>{options.importPublished ? 'Published articles included' : 'Published articles excluded'}</Typography><Typography>{options.importUnpublishedAsDrafts ? 'Unpublished articles imported as drafts' : 'Unpublished articles excluded'}</Typography><Typography>{options.importCategories ? 'Categories included' : 'Categories excluded'} · {options.importMedia ? 'Media included' : 'Media excluded'}</Typography></Stack></KbWorkflowDialog>
  </KbPageShell>
}

const ArticlePreviewDialog = ({ article, onClose }: { article?: HelpJuiceMigrationPreviewArticle; onClose: () => void }) => <Dialog open={Boolean(article)} onClose={onClose} fullWidth maxWidth='lg' scroll='paper'>
  {article && <><DialogTitle sx={{ px: 6, pt: 5, pb: 2 }}><Stack direction='row' spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><Box><Stack direction='row' spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography variant='h5' sx={{ fontWeight: 800 }}>{article.title || 'Untitled article'}</Typography><Chip size='small' label='Read-only preview' variant='outlined' /><Chip size='small' label={article.visibility} color={article.visibility === 'Internal' ? 'warning' : 'success'} /></Stack><Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>{article.categoryLocation || 'Uncategorized'} · {article.isArchived ? 'Archived' : article.isPublished ? 'Published' : 'Draft'}</Typography></Box><IconButton aria-label='Close article preview' onClick={onClose}><X size={20} /></IconButton></Stack></DialogTitle>
    <DialogContent dividers sx={{ px: 6, py: 4 }}><Stack spacing={4}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' }, gap: 2 }}><Metadata label='Source question' value={`${article.externalId} · row ${article.questionRowNumber}`} /><Metadata label='Source answer' value={article.answerExternalId ? `${article.answerExternalId} · row ${article.answerRowNumber}` : 'No matching answer'} /><Metadata label='Slug' value={article.slug || 'No slug'} /><Metadata label='Resolved KB author' value={article.authorName || 'Not resolved—migration actor will be used'} /><Metadata label='HelpJuice account ID' value={article.helpJuiceAuthorId || 'Not supplied'} /><Metadata label='Resolved KB user ID' value={article.authorUserId || 'Not resolved'} /><Metadata label='Visibility' value={article.visibility} /><Metadata label='Created' value={formatDate(article.createdAt)} /><Metadata label='Updated' value={formatDate(article.updatedAt)} /><Metadata label='Content text' value={`${article.contentTextLength.toLocaleString()} characters`} /></Box>
      {article.description && <Box><Typography variant='overline' color='text.secondary'>Description</Typography><Typography>{article.description}</Typography></Box>}
      <Box><Typography variant='h6' sx={{ mb: 2, fontWeight: 750 }}>Validation</Typography>{article.issues.length === 0 ? <Alert severity='success'>No warnings or errors for this previewed article.</Alert> : <Stack spacing={1.5}>{[...article.issues].sort(issueSort).map(issue => <IssueAlert key={issue.id} issue={issue} />)}</Stack>}</Box>
      <Box><Typography variant='h6' sx={{ mb: 2, fontWeight: 750 }}>Parsed article body</Typography><Box sx={{ border: theme => `1px solid ${theme.palette.divider}`, borderRadius: 1, p: { xs: 3, md: 5 }, minHeight: 180, bgcolor: 'background.paper' }}><KnowledgeBaseViewer content={article.contentHtml || '<p></p>'} /></Box></Box>
      <Accordion disableGutters elevation={0} sx={{ border: theme => `1px solid ${theme.palette.divider}`, '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ChevronDown size={18} />}><Typography sx={{ fontWeight: 700 }}>Source / import metadata ({Object.keys(article.sourceMetadata).length})</Typography></AccordionSummary><AccordionDetails><Box component='dl' sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 0.4fr) 1fr' }, gap: 1.5 }}>{Object.entries(article.sourceMetadata).map(([key, value]) => <Box key={key} sx={{ display: 'contents' }}><Typography component='dt' variant='body2' color='text.secondary' sx={{ fontFamily: 'monospace' }}>{key}</Typography><Typography component='dd' variant='body2' sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography></Box>)}</Box></AccordionDetails></Accordion>
    </Stack></DialogContent><DialogActions sx={{ px: 6, py: 3 }}><Button variant='contained' onClick={onClose}>Close preview</Button></DialogActions></>}
</Dialog>

const IssueAlert = ({ issue }: { issue: MigrationIssue }) => <Alert severity={issue.severity === 'Error' ? 'error' : 'warning'}><AlertTitle>{issue.severity}: {issue.errorCode}</AlertTitle>{issue.message}<Typography component='span' variant='caption' sx={{ display: 'block', mt: 0.5 }}>{issueSource(issue)}</Typography></Alert>
const ArticleIssueStatus = ({ issues }: { issues: MigrationIssue[] }) => { const errors = issues.filter(issue => issue.severity === 'Error').length; const warnings = issues.length - errors; return errors || warnings ? <Stack direction='row' spacing={1}>{errors > 0 && <Chip size='small' color='error' label={`${errors} error${errors === 1 ? '' : 's'}`} />}{warnings > 0 && <Chip size='small' color='warning' label={`${warnings} warning${warnings === 1 ? '' : 's'}`} />}</Stack> : <StatusChip label='No issues' color='success' /> }
const issueSource = (issue: MigrationIssue) => [issue.fileName, issue.rowNumber ? `row ${issue.rowNumber}` : undefined, issue.externalId ? `ID ${issue.externalId}` : undefined].filter(Boolean).join(' · ') || 'Package-level validation'
const issueSort = (left: MigrationIssue, right: MigrationIssue) => left.severity === right.severity ? (left.rowNumber ?? 0) - (right.rowNumber ?? 0) : left.severity === 'Error' ? -1 : 1
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not supplied'
const Metadata = ({ label, value }: { label: string; value: string }) => <Box><Typography variant='caption' color='text.secondary' sx={{ textTransform: 'uppercase', fontWeight: 700 }}>{label}</Typography><Typography variant='body2' sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{value}</Typography></Box>
const issuesCsv = (issues: MigrationIssue[]) => ['severity,fileName,rowNumber,externalEntityType,externalId,errorCode,message,sourceDataSummary,createdAt', ...issues.map(issue => [issue.severity, issue.fileName, issue.rowNumber, issue.externalEntityType, issue.externalId, issue.errorCode, issue.message, issue.sourceDataSummary, issue.createdAt].map(csvCell).join(','))].join('\r\n')
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const downloadDiagnostic = (report: HelpJuiceDiagnosticDownload) => {
  const url = URL.createObjectURL(report.blob)
  const link = document.createElement('a')
  link.href = url; link.download = report.fileName; link.click()
  URL.revokeObjectURL(url)
}
const Metric = ({ label, value, warn = false, error = false }: { label: string; value: number; warn?: boolean; error?: boolean }) => <Box><Typography variant='h5' color={error && value ? 'error.main' : warn && value ? 'warning.main' : 'text.primary'} sx={{ fontWeight: 800 }}>{value.toLocaleString()}</Typography><Typography variant='caption' color='text.secondary' sx={{ textTransform: 'uppercase', fontWeight: 700 }}>{label}</Typography></Box>
const Option = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => <FormControlLabel control={<Switch checked={checked} onChange={event => onChange(event.target.checked)} />} label={label} />
const BackendValidation = ({ summary }: { summary: HelpJuiceMigrationResponse['validation'] }) => <Alert severity={summary.blockingErrorCount ? 'error' : summary.warningCount ? 'warning' : 'success'} icon={<ShieldCheck size={20} />}><AlertTitle>{summary.blockingErrorCount ? 'Blocking validation errors' : summary.warningCount ? 'Validated with warnings' : 'Authoritative validation passed'}</AlertTitle>{summary.blockingErrorCount} blocking errors and {summary.warningCount} warnings. {summary.missingRequiredFiles.length ? `Missing: ${summary.missingRequiredFiles.join(', ')}.` : ''}</Alert>
const IssueSummary = ({ issues }: { issues: MigrationIssue[] }) => { const groups = Object.entries(issues.reduce<Record<string, { severity: MigrationIssue['severity']; count: number }>>((all, issue) => { const current = all[issue.errorCode]; all[issue.errorCode] = current ? { ...current, count: current.count + 1 } : { severity: issue.severity, count: 1 }; return all }, {})).sort(([, left], [, right]) => left.severity === right.severity ? right.count - left.count : left.severity === 'Error' ? -1 : 1); return groups.length ? <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{groups.map(([code, group]) => <Chip key={code} size='small' color={group.severity === 'Error' ? 'error' : 'warning'} label={`${code}: ${group.count}`} />)}</Stack> : <Alert severity='success'>No migration issues were recorded.</Alert> }
const issueColumns: Array<KbDataTableColumn<MigrationIssue>> = [{ id: 'severity', label: 'Severity', render: issue => <StatusChip label={issue.severity} color={issue.severity === 'Error' ? 'error' : 'warning'} /> }, { id: 'source', label: 'Source', render: issue => <Typography variant='body2'>{issueSource(issue)}</Typography> }, { id: 'code', label: 'Code', render: issue => <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>{issue.errorCode}</Typography> }, { id: 'message', label: 'Message', render: issue => <Typography variant='body2'>{issue.message}</Typography> }]

export default HelpJuiceMigrationPage
