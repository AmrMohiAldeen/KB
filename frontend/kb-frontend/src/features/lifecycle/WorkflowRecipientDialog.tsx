'use client'

import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { getNotificationRecipients } from '@/lib/api/notificationsApi'
import type { NotificationRecipientResponse } from '@/types/apps/notificationTypes'

type WorkflowRecipientDialogProps = {
  open: boolean
  actionLabel: string
  accessToken: string
  onClose: () => void
  onConfirm: (userIds: string[]) => void
}

export default function WorkflowRecipientDialog({
  open,
  actionLabel,
  accessToken,
  onClose,
  onConfirm
}: WorkflowRecipientDialogProps) {
  const [users, setUsers] = useState<NotificationRecipientResponse[]>([])
  const [selected, setSelected] = useState<NotificationRecipientResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSelected([])
      setLoading(true)
      setError('')
      getNotificationRecipients(accessToken, controller.signal)
        .then(setUsers)
        .catch(value => {
          if (!(value instanceof DOMException && value.name === 'AbortError'))
            setError('System users could not be loaded.')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [accessToken, open])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Notify additional users</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          These users will be notified about this {actionLabel.toLowerCase()} action only. Existing article subscribers are notified as usual.
        </Typography>
        {error && <Alert severity='error' sx={{ mb: 2 }}>{error}</Alert>}
        <Autocomplete
          multiple
          options={users}
          value={selected}
          loading={loading}
          onChange={(_event, value) => setSelected(value)}
          getOptionKey={option => option.userId}
          getOptionLabel={option => option.fullName}
          isOptionEqualToValue={(option, value) => option.userId === value.userId}
          renderOption={(props, option) => (
            <li {...props} key={option.userId}>
              <span>{option.fullName}<br /><small>{option.email}</small></span>
            </li>
          )}
          renderInput={params => (
            <TextField
              {...params}
              label='Additional recipients'
              placeholder='Search system users'
              slotProps={{
                ...params.slotProps,
                input: {
                  ...params.slotProps.input,
                  endAdornment: <>{loading ? <CircularProgress size={18} /> : null}{params.slotProps.input.endAdornment}</>
                }
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant='contained'
          disabled={loading || Boolean(error)}
          onClick={() => onConfirm(selected.map(user => user.userId))}
        >
          Continue {selected.length > 0 ? `with ${selected.length}` : 'without extras'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
