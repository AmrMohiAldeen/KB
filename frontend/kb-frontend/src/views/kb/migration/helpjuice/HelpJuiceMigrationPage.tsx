'use client'

import { useMemo, useState, type ChangeEvent } from 'react'

import type { Content } from '@tiptap/core'

import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Eye,
  FileSearch,
  FileSpreadsheet,
  PackageCheck,
  UploadCloud,
  X
} from 'lucide-react'

import { KbEmptyState, KbPageShell, KbSectionCard } from '@/views/shared'
import KnowledgeBaseViewer from '@/features/editor/core/KnowledgeBaseViewer'
import KbWorkflowDialog from '@/views/shared/dialogs/KbWorkflowDialog'
import KbDataTable from '@/views/shared/tables/KbDataTable'
import type { KbDataTableColumn } from '@/views/shared/tables/KbDataTable'
import PageHeader from '../../shared/components/PageHeader'
import StatusChip from '../../shared/components/StatusChip'

import { parseHelpJuiceCsv } from './csv'
import { buildHelpJuiceImport, createHelpJuicePreparedImportPayload } from './helpjuiceImport'
import type {
  HelpJuiceFileKind,
  HelpJuiceImportCandidate,
  HelpJuicePreparedImportPayload,
  HelpJuiceValidationIssue,
  ParsedCsvFile
} from './types'

type CsvUploadState =
  | {
      status: 'empty'
    }
  | {
      status: 'ready'
      fileName: string
      parsed: ParsedCsvFile
    }
  | {
      status: 'error'
      fileName: string
      issues: HelpJuiceValidationIssue[]
    }

type UploadCardProps = {
  kind: HelpJuiceFileKind
  title: string
  description: string
  requiredColumns: string
  state: CsvUploadState
  onFileSelected: (kind: HelpJuiceFileKind, event: ChangeEvent<HTMLInputElement>) => void
}

type IssueCounts = {
  warnings: number
  errors: number
}

const EMPTY_UPLOAD_STATE: CsvUploadState = { status: 'empty' }
const PREVIEW_JSON_LIMIT = 12000
const ISSUE_PREVIEW_LIMIT = 8

const getStateIssues = (state: CsvUploadState): HelpJuiceValidationIssue[] => {
  if (state.status === 'ready') return state.parsed.issues
  if (state.status === 'error') return state.issues

  return []
}

const getIssueCounts = (issues: readonly HelpJuiceValidationIssue[]): IssueCounts => ({
  warnings: issues.filter(issue => issue.severity === 'warning').length,
  errors: issues.filter(issue => issue.severity === 'error').length
})

const issueMessages = (issues: readonly HelpJuiceValidationIssue[]) =>
  issues.map(issue => (issue.rowNumber ? `Row ${issue.rowNumber}: ${issue.message}` : issue.message))

const summarizeIssues = (issues: readonly HelpJuiceValidationIssue[]) => {
  const messages = issueMessages(issues)

  if (messages.length <= ISSUE_PREVIEW_LIMIT) return messages

  return [...messages.slice(0, ISSUE_PREVIEW_LIMIT), `${messages.length - ISSUE_PREVIEW_LIMIT} more issues not shown.`]
}

const formatOptionalValue = (value: string | number | boolean | undefined) => {
  if (value === undefined || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'

  return String(value)
}

const getCandidateIssueCounts = (candidates: readonly HelpJuiceImportCandidate[]): IssueCounts => ({
  warnings: candidates.reduce((total, candidate) => total + candidate.warnings.length, 0),
  errors: candidates.reduce((total, candidate) => total + candidate.errors.length, 0)
})

const isRenderableTiptapContent = (value: unknown): value is Content => {
  if (typeof value === 'string') return true
  if (Array.isArray(value)) return true
  if (!value || typeof value !== 'object') return false

  return 'type' in value && typeof (value as { type?: unknown }).type === 'string'
}

const UploadCard = ({ kind, title, description, requiredColumns, state, onFileSelected }: UploadCardProps) => {
  const issues = getStateIssues(state)
  const counts = getIssueCounts(issues)
  const rowCount = state.status === 'ready' ? state.parsed.rows.length : 0
  const statusLabel =
    state.status === 'empty'
      ? 'Waiting'
      : counts.errors > 0
        ? 'Errors'
        : counts.warnings > 0
          ? 'Warnings'
          : 'Parsed'
  const statusColor =
    state.status === 'empty' ? 'default' : counts.errors > 0 ? 'error' : counts.warnings > 0 ? 'warning' : 'success'

  return (
    <Box
      sx={theme => ({
        minBlockSize: 236,
        border: `1px dashed ${alpha(theme.palette.primary.main, 0.35)}`,
        borderRadius: 2,
        p: { xs: 4, md: 5 },
        bgcolor: alpha(theme.palette.primary.main, 0.03)
      })}
    >
      <Stack spacing={4} sx={{ blockSize: '100%' }}>
        <Stack direction='row' spacing={3} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Stack direction='row' spacing={3} sx={{ minInlineSize: 0 }}>
            <FileSpreadsheet size={24} color='var(--mui-palette-primary-main)' />
            <Box sx={{ minInlineSize: 0 }}>
              <Typography color='text.primary' sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5, lineHeight: 1.6 }}>
                {description}
              </Typography>
            </Box>
          </Stack>
          <Chip label={statusLabel} color={statusColor} size='small' variant='tonal' />
        </Stack>

        <Stack spacing={2}>
          <Typography variant='body2' color='text.secondary'>
            Required columns: {requiredColumns}
          </Typography>
          <Typography color='text.primary' sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {state.status === 'empty' ? 'No file selected' : state.fileName}
          </Typography>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 2
          }}
        >
          <StatusMetric label='Rows' value={rowCount} />
          <StatusMetric label='Warnings' value={counts.warnings} color={counts.warnings ? 'warning.main' : undefined} />
          <StatusMetric label='Errors' value={counts.errors} color={counts.errors ? 'error.main' : undefined} />
        </Box>

        <Box sx={{ mt: 'auto' }}>
          <Button variant='outlined' component='label' startIcon={<UploadCloud size={18} />}>
            Choose CSV
            <input hidden type='file' accept='.csv,text/csv' onChange={event => onFileSelected(kind, event)} />
          </Button>
        </Box>
      </Stack>
    </Box>
  )
}

const StatusMetric = ({ label, value, color }: { label: string; value: number; color?: string }) => (
  <Box>
    <Typography variant='h6' color={color ?? 'text.primary'} sx={{ fontWeight: 700 }}>
      {value}
    </Typography>
    <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
      {label}
    </Typography>
  </Box>
)

const ValidationPanel = ({
  buildReady,
  validationIssues,
  candidateIssueCounts
}: {
  buildReady: boolean
  validationIssues: HelpJuiceValidationIssue[]
  candidateIssueCounts: IssueCounts
}) => {
  if (!buildReady) {
    return (
      <KbEmptyState
        title='No import validation yet'
        description='Validation will appear after both source CSV files are selected.'
        icon={<FileSearch />}
        minHeight={220}
      />
    )
  }

  const errors = validationIssues.filter(issue => issue.severity === 'error')
  const warnings = validationIssues.filter(issue => issue.severity === 'warning')

  if (!errors.length && !warnings.length && !candidateIssueCounts.errors && !candidateIssueCounts.warnings) {
    return (
      <Alert severity='success' icon={<CheckCircle2 size={20} />}>
        <AlertTitle>Ready to prepare</AlertTitle>
        No blocking validation issues were found in the parsed HelpJuice export.
      </Alert>
    )
  }

  return (
    <Stack spacing={3}>
      {errors.length > 0 && (
        <Alert severity='error' icon={<AlertTriangle size={20} />}>
          <AlertTitle>Blocking validation errors</AlertTitle>
          <IssueList messages={summarizeIssues(errors)} />
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert severity='warning'>
          <AlertTitle>Source warnings</AlertTitle>
          <IssueList messages={summarizeIssues(warnings)} />
        </Alert>
      )}
      {(candidateIssueCounts.errors > 0 || candidateIssueCounts.warnings > 0) && (
        <Alert severity={candidateIssueCounts.errors ? 'error' : 'warning'}>
          <AlertTitle>Candidate issues</AlertTitle>
          {candidateIssueCounts.errors} candidate errors and {candidateIssueCounts.warnings} candidate warnings were
          generated while matching article bodies.
        </Alert>
      )}
    </Stack>
  )
}

const IssueList = ({ messages }: { messages: string[] }) => (
  <List dense disablePadding>
    {messages.map(message => (
      <ListItem key={message} disablePadding>
        <ListItemText primary={message} />
      </ListItem>
    ))}
  </List>
)

const CandidateDetailsDialog = ({
  candidate,
  onClose
}: {
  candidate: HelpJuiceImportCandidate | null
  onClose: () => void
}) => {
  if (!candidate) return null

  const renderableContent = isRenderableTiptapContent(candidate.tiptapJson) ? candidate.tiptapJson : null

  const metadataRows = [
    ['Question ID', candidate.sourceQuestionId],
    ['Answer IDs', candidate.sourceAnswerIds.join(', ') || '-'],
    ['Author IDs', candidate.sourceAuthorIds.join(', ') || '-'],
    ['Slug', candidate.slug],
    ['Category ID', candidate.sourceCategoryId],
    ['Published', candidate.sourceIsPublished],
    ['Created', candidate.sourceCreatedAt],
    ['Updated', candidate.sourceUpdatedAt],
    ['Language', candidate.sourceLanguageCode ?? candidate.sourceLanguageId],
    ['Views', candidate.sourceViews],
    ['Expiration', candidate.sourceExpirationDate],
    ['Keywords', candidate.sourceKeywordNames]
  ] as const

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth='lg'>
      <DialogTitle sx={{ px: 6, pt: 6, pb: 0 }}>
        <Stack direction='row' spacing={3} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ minInlineSize: 0 }}>
            <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {candidate.title}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
              HelpJuice import candidate
            </Typography>
          </Box>
          <IconButton size='small' onClick={onClose} aria-label='Close details dialog'>
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ px: 6, py: 5 }}>
        <Stack spacing={5}>
          {(candidate.errors.length > 0 || candidate.warnings.length > 0) && (
            <Stack spacing={3}>
              {candidate.errors.length > 0 && (
                <Alert severity='error'>
                  <AlertTitle>Errors</AlertTitle>
                  <IssueList messages={candidate.errors} />
                </Alert>
              )}
              {candidate.warnings.length > 0 && (
                <Alert severity='warning'>
                  <AlertTitle>Warnings</AlertTitle>
                  <IssueList messages={candidate.warnings} />
                </Alert>
              )}
            </Stack>
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
              gap: 3
            }}
          >
            {metadataRows.map(([label, value]) => (
              <Box key={label}>
                <Typography variant='caption' color='text.secondary' sx={{ fontWeight: 700, textTransform: 'uppercase' }}>
                  {label}
                </Typography>
                <Typography color='text.primary' sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                  {formatOptionalValue(value)}
                </Typography>
              </Box>
            ))}
          </Box>

          <Divider />

          <Stack spacing={2}>
            <Typography color='text.primary' sx={{ fontWeight: 700 }}>
              Rendered Article Preview
            </Typography>
            <Box
              sx={{
                maxBlockSize: '62vh',
                overflow: 'auto',
                borderRadius: 1,
                border: theme => `1px solid ${theme.palette.divider}`,
                p: { xs: 4, md: 6 },
                bgcolor: 'background.paper'
              }}
            >
              {renderableContent ? (
                <KnowledgeBaseViewer content={renderableContent} />
              ) : (
                <KbEmptyState
                  title='Preview unavailable'
                  description='The imported document could not be rendered as Tiptap content.'
                  icon={<FileSearch />}
                  minHeight={220}
                />
              )}
            </Box>
          </Stack>
            <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
              gap: 4
            }}
          >
            <CodeBlock title='Original HTML Body' value={candidate.htmlBody || '<empty>'} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pt: 0, pb: 6 }}>
        <Button variant='contained' onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const CodeBlock = ({ title, value }: { title: string; value: string }) => (
  <Stack spacing={2}>
    <Typography color='text.primary' sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    <Box
      component='pre'
      sx={theme => ({
        m: 0,
        maxBlockSize: 320,
        overflow: 'auto',
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
        color: 'text.primary',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.7,
        p: 3,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere'
      })}
    >
      {value}
    </Box>
  </Stack>
)

const HelpJuiceMigrationPage = () => {
  const [questionsFile, setQuestionsFile] = useState<CsvUploadState>(EMPTY_UPLOAD_STATE)
  const [answersFile, setAnswersFile] = useState<CsvUploadState>(EMPTY_UPLOAD_STATE)
  const [selectedCandidate, setSelectedCandidate] = useState<HelpJuiceImportCandidate | null>(null)
  const [preparedPayload, setPreparedPayload] = useState<HelpJuicePreparedImportPayload | null>(null)
  const [previewPage, setPreviewPage] = useState(0)
  const [previewRowsPerPage, setPreviewRowsPerPage] = useState(10)

  const buildResult = useMemo(() => {
    if (questionsFile.status !== 'ready' || answersFile.status !== 'ready') return null

    return buildHelpJuiceImport({
      questions: questionsFile.parsed,
      answers: answersFile.parsed
    })
  }, [answersFile, questionsFile])

  const candidates = buildResult?.candidates ?? []
  const candidateIssueCounts = getCandidateIssueCounts(candidates)
  const blockingErrorCount =
    (buildResult?.validationIssues.filter(issue => issue.severity === 'error').length ?? 0) + candidateIssueCounts.errors
  const canPrepareImport =
    buildResult !== null &&
    questionsFile.status === 'ready' &&
    answersFile.status === 'ready' &&
    candidates.length > 0 &&
    blockingErrorCount === 0
  const maxPreviewPage = Math.max(Math.ceil(candidates.length / previewRowsPerPage) - 1, 0)
  const currentPreviewPage = Math.min(previewPage, maxPreviewPage)
  const pagedCandidates = candidates.slice(
    currentPreviewPage * previewRowsPerPage,
    currentPreviewPage * previewRowsPerPage + previewRowsPerPage
  )

  const columns = useMemo<Array<KbDataTableColumn<HelpJuiceImportCandidate>>>(
    () => [
      {
        id: 'title',
        label: 'Title',
        render: candidate => (
          <Box sx={{ minInlineSize: 260 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {candidate.title}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ overflowWrap: 'anywhere' }}>
              {candidate.slug ? `/${candidate.slug}` : candidate.sourceQuestionId}
            </Typography>
          </Box>
        )
      },
      {
        id: 'source',
        label: 'Source',
        render: candidate => (
          <Stack spacing={0.5}>
            <Typography variant='body2' color='text.primary'>
              Q: {candidate.sourceQuestionId}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              A: {candidate.sourceAnswerIds.length ? candidate.sourceAnswerIds.join(', ') : '-'}
            </Typography>
          </Stack>
        )
      },
      {
        id: 'state',
        label: 'State',
        render: candidate => (
          <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <StatusChip
              label={
                candidate.sourceIsPublished === undefined ? 'Not loaded' : candidate.sourceIsPublished ? 'Published' : 'Draft'
              }
              color={candidate.sourceIsPublished === true ? 'success' : candidate.sourceIsPublished === false ? 'secondary' : 'default'}
            />
            {candidate.sourceViews !== undefined && <Chip size='small' label={`${candidate.sourceViews} views`} variant='tonal' />}
          </Stack>
        )
      },
      {
        id: 'body',
        label: 'Body',
        render: candidate => (
          <Box sx={{ maxInlineSize: 280 }}>
            <Typography variant='body2' color='text.primary' noWrap>
              {candidate.plainTextBody || 'No body'}
            </Typography>
            <Typography variant='caption' color='text.secondary'>
              {candidate.plainTextBody.length.toLocaleString()} plain-text chars
            </Typography>
          </Box>
        )
      },
      {
        id: 'issues',
        label: 'Issues',
        render: candidate => (
          <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Chip
              size='small'
              label={`${candidate.errors.length} errors`}
              color={candidate.errors.length ? 'error' : 'default'}
              variant='tonal'
            />
            <Chip
              size='small'
              label={`${candidate.warnings.length} warnings`}
              color={candidate.warnings.length ? 'warning' : 'default'}
              variant='tonal'
            />
          </Stack>
        )
      },
      {
        id: 'actions',
        label: 'Actions',
        align: 'right',
        hideable: false,
        render: candidate => (
          <Tooltip title='View import details'>
            <IconButton size='small' onClick={() => setSelectedCandidate(candidate)}>
              <Eye size={18} />
            </IconButton>
          </Tooltip>
        )
      }
    ],
    []
  )

  const handleFileSelected = async (kind: HelpJuiceFileKind, event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) return

    try {
      const text = await file.text()
      const parsed = parseHelpJuiceCsv(text, kind)
      const nextState: CsvUploadState = {
        status: 'ready',
        fileName: file.name,
        parsed
      }

      if (kind === 'questions') {
        setQuestionsFile(nextState)
      } else {
        setAnswersFile(nextState)
      }
    } catch {
      const errorState: CsvUploadState = {
        status: 'error',
        fileName: file.name,
        issues: [
          {
            severity: 'error',
            file: kind,
            message: `${file.name} could not be read by the browser.`
          }
        ]
      }

      if (kind === 'questions') {
        setQuestionsFile(errorState)
      } else {
        setAnswersFile(errorState)
      }
    } finally {
      input.value = ''
    }
  }

  const handlePrepareImport = () => {
    if (!buildResult || questionsFile.status !== 'ready' || answersFile.status !== 'ready') return

    const payload = createHelpJuicePreparedImportPayload({
      result: buildResult,
      questionsFileName: questionsFile.fileName,
      answersFileName: answersFile.fileName
    })

    // TODO: connect to backend API.
    // POST /api/kb/migrations/helpjuice/import should accept this prepared payload after backend validation exists.
    setPreparedPayload(payload)
  }

  const preparedPayloadPreview = useMemo(() => {
    if (!preparedPayload) return ''

    const previewPayload = {
      ...preparedPayload,
      candidates: preparedPayload.candidates.slice(0, 3)
    }
    const serialized = JSON.stringify(previewPayload, null, 2) ?? ''

    return serialized.length > PREVIEW_JSON_LIMIT
      ? `${serialized.slice(0, PREVIEW_JSON_LIMIT)}\n...\nPreview truncated.`
      : serialized
  }, [preparedPayload])

  return (
    <KbPageShell>
      <PageHeader
        title='HelpJuice Migration'
        subtitle='Import HelpJuice questions and answers exports, validate matched article candidates, and prepare a backend-ready payload.'
        actions={
          <Button
            variant='contained'
            startIcon={<PackageCheck size={18} />}
            disabled={!canPrepareImport}
            onClick={handlePrepareImport}
          >
            Prepare Import
          </Button>
        }
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
          gap: 5
        }}
      >
        <UploadCard
          kind='questions'
          title='questions.csv'
          description='Article metadata, publication state, category source IDs, language, keywords, views, and timestamps.'
          requiredColumns='id, name'
          state={questionsFile}
          onFileSelected={handleFileSelected}
        />
        <UploadCard
          kind='answers'
          title='answers.csv'
          description='Article HTML bodies linked to question IDs, plus source answer and author IDs.'
          requiredColumns='question_id, body'
          state={answersFile}
          onFileSelected={handleFileSelected}
        />
      </Box>

      <KbSectionCard
        title='Validation'
        description='Client-side parsing, required-column checks, answer matching, and conversion issues.'
      >
        <ValidationPanel
          buildReady={buildResult !== null}
          validationIssues={buildResult?.validationIssues ?? []}
          candidateIssueCounts={candidateIssueCounts}
        />
      </KbSectionCard>

      <KbDataTable
        ariaLabel='HelpJuice import candidates table'
        rows={pagedCandidates}
        columns={columns}
        getRowId={candidate => candidate.sourceQuestionId}
        emptyState={{
          title: 'No import candidates yet',
          description: 'Article candidates will appear after both HelpJuice CSV files have been parsed.'
        }}
        pagination={{
          page: currentPreviewPage,
          rowsPerPage: previewRowsPerPage,
          totalRows: candidates.length,
          onPageChange: setPreviewPage,
          onRowsPerPageChange: rowsPerPage => {
            setPreviewRowsPerPage(rowsPerPage)
            setPreviewPage(0)
          }
        }}
        toolbar={
          <Box
            sx={theme => ({
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 3,
              p: { xs: 4, md: 5 },
              borderBlockEnd: `1px solid ${theme.palette.divider}`
            })}
          >
            <Box>
              <Typography variant='h6' color='text.primary' sx={{ fontWeight: 700 }}>
                Import Candidates
              </Typography>
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                One candidate is created for each HelpJuice question row.
              </Typography>
            </Box>
            <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Chip size='small' label={`${candidates.length} candidates`} icon={<FileSpreadsheet size={16} />} />
              <Chip
                size='small'
                label={`${candidateIssueCounts.warnings} warnings`}
                color={candidateIssueCounts.warnings ? 'warning' : 'default'}
                variant='tonal'
              />
              <Chip
                size='small'
                label={`${candidateIssueCounts.errors} errors`}
                color={candidateIssueCounts.errors ? 'error' : 'default'}
                variant='tonal'
              />
            </Stack>
          </Box>
        }
      />

      <CandidateDetailsDialog candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />

      <KbWorkflowDialog
        open={preparedPayload !== null}
        title='Prepared Import Payload'
        description='The payload is ready for a future backend migration endpoint. No articles were created.'
        confirmLabel='Close'
        cancelLabel='Review Candidates'
        notice={
          preparedPayload
            ? `${preparedPayload.candidates.length} candidates prepared with ${preparedPayload.warnings.length} warnings.`
            : undefined
        }
        onClose={() => setPreparedPayload(null)}
        onConfirm={() => setPreparedPayload(null)}
      >
        <Stack spacing={3}>
          <Alert severity='info' icon={<Code2 size={20} />}>
            The preview includes the first three candidates; the full payload remains in memory for the future API handoff.
          </Alert>
          <CodeBlock title='Payload Preview' value={preparedPayloadPreview || '{}'} />
        </Stack>
      </KbWorkflowDialog>
    </KbPageShell>
  )
}

export default HelpJuiceMigrationPage
