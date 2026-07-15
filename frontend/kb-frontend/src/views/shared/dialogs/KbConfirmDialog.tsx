'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { ButtonProps } from '@mui/material/Button'
import { AlertTriangle } from 'lucide-react'

type KbConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: ButtonProps['color']
  icon?: ReactNode
  submitting?: boolean
  onClose: () => void
  onConfirm: () => void
}

export const KbConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  icon,
  submitting = false,
  onClose,
  onConfirm
}: KbConfirmDialogProps) => (
  <Dialog open={open} onClose={() => { if (!submitting) onClose() }} fullWidth maxWidth='xs'>
    <DialogContent sx={{ px: 6, pt: 7, pb: 3 }}>
      <Stack spacing={3} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Stack
          sx={theme => ({
            alignItems: 'center',
            inlineSize: 58,
            blockSize: 58,
            borderRadius: 2,
            color: theme.palette[confirmColor === 'error' ? 'error' : 'warning'].main,
            bgcolor: alpha(theme.palette[confirmColor === 'error' ? 'error' : 'warning'].main, 0.1),
            justifyContent: 'center'
          })}
        >
          {icon ?? <AlertTriangle size={26} />}
        </Stack>
        <Stack spacing={1}>
          <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Typography color='text.secondary' sx={{ lineHeight: 1.6 }}>
            {description}
          </Typography>
        </Stack>
      </Stack>
    </DialogContent>
    <DialogActions sx={{ justifyContent: 'center', gap: 2, px: 6, pt: 0, pb: 6 }}>
      <Button variant='tonal' color='secondary' onClick={onClose} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button variant='contained' color={confirmColor} onClick={onConfirm} loading={submitting} disabled={submitting}>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
)

export default KbConfirmDialog
