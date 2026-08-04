'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

type KbWorkflowDialogProps = {
  open: boolean
  title: string
  description: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  notice?: string
  onClose: () => void
  onConfirm: () => void
}

export const KbWorkflowDialog = ({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  notice,
  onClose,
  onConfirm
}: KbWorkflowDialogProps) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
    <DialogTitle sx={{ px: 6, pt: 6, pb: 0 }}>
      <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
    </DialogTitle>
    <DialogContent sx={{ px: 6, py: 5 }}>
      <Stack spacing={4}>
        <Typography color='text.secondary' sx={{ lineHeight: 1.6 }}>
          {description}
        </Typography>
        {notice && <Alert severity='info'>{notice}</Alert>}
        {children && <Box>{children}</Box>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 6, pt: 0, pb: 6 }}>
      <Button variant='tonal' color='secondary' onClick={onClose}>
        {cancelLabel}
      </Button>
      <Button variant='contained' onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
)

export default KbWorkflowDialog
