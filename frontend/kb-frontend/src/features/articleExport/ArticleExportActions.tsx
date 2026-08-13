'use client'

import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { Download, FileCode2 } from 'lucide-react'
import { downloadArticleExport } from '@/lib/api/exportJobsApi'
import type { ArticleExportSource, ExportFormat } from '@/types/apps/exportJobTypes'

type ArticleExportActionsProps = {
  articleId: string
  source: ArticleExportSource
  accessToken: string
  beforeExport?: () => Promise<boolean | void>
  disabled?: boolean
}

export default function ArticleExportActions({
  articleId,
  source,
  accessToken,
  beforeExport,
  disabled = false
}: ArticleExportActionsProps) {
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null)
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  const start = async (format: ExportFormat) => {
    if (activeFormat) return
    setActiveFormat(format)
    setMessage(null)
    controller.current = new AbortController()
    try {
      if (await beforeExport?.() === false) return
      await downloadArticleExport(articleId, source, format, accessToken, controller.current.signal)
      setMessage({ severity: 'success', text: `${format} export downloaded.` })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : 'The export could not be generated.'
      })
    } finally {
      controller.current = null
      setActiveFormat(null)
    }
  }

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
      <Stack direction='row' spacing={1}>
        <Button
          variant='outlined'
          size='small'
          startIcon={activeFormat === 'PDF' ? <CircularProgress size={15} /> : <Download size={16} />}
          disabled={disabled || activeFormat !== null}
          onClick={() => void start('PDF')}
        >
          Export PDF
        </Button>
        <Button
          variant='outlined'
          size='small'
          startIcon={activeFormat === 'HTML' ? <CircularProgress size={15} /> : <FileCode2 size={16} />}
          disabled={disabled || activeFormat !== null}
          onClick={() => void start('HTML')}
        >
          Export HTML
        </Button>
      </Stack>
      {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}
    </Stack>
  )
}
