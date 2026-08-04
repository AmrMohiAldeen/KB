'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { X } from 'lucide-react'

type KbFormDialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  submitLabel?: string
  cancelLabel?: string
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg'
  submitting?: boolean
  onClose: () => void
  onSubmit: () => void
}

export const KbFormDialog = ({
  open,
  title,
  description,
  children,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  maxWidth = 'sm',
  submitting = false,
  onClose,
  onSubmit
}: KbFormDialogProps) => (
  <Dialog open={open} 
          onClose={() => { if (!submitting) onClose()}} 
          fullWidth maxWidth={maxWidth}>
    <DialogTitle sx={{ px: 6, pt: 6, pb: 0 }}>
      <Stack direction='row' spacing={3} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Stack spacing={1}>
          <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant='body2' color='text.secondary'>
              {description}
            </Typography>
          )}
        </Stack>
        <IconButton size='small' onClick={onClose} disabled={submitting} aria-label='Close dialog'>
          <X size={18} />
        </IconButton>
      </Stack>
    </DialogTitle>
    <DialogContent sx={{ px: 6, py: 5 }}>{children}</DialogContent>
    <DialogActions sx={{ px: 6, pt: 0, pb: 6 }}>
      <Button variant='tonal' color='secondary' onClick={onClose} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button variant='contained' onClick={onSubmit} loading={submitting} disabled={submitting}>
        {submitLabel}
      </Button>
    </DialogActions>
  </Dialog>
)

export default KbFormDialog
