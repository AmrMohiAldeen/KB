'use client'

import { useEffect, useState } from 'react'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'

import CustomTextField from '@core/components/mui/TextField'
import type { UserRoleSummary, UsersType } from '@/types/apps/userTypes'
import KbFormDialog from '@/views/shared/dialogs/KbFormDialog'
import KbFormGrid from '@/views/shared/forms/KbFormGrid'
import KbValidationSummary from '@/views/shared/forms/KbValidationSummary'

export type UserFormState = {
  fullName: string
  email: string
  roleId: string
}

type UserDialogProps = {
  open: boolean
  user?: UsersType
  roles: UserRoleSummary[]
  submitting?: boolean
  errors?: string[]
  onClose: () => void
  onSubmit: (form: UserFormState) => Promise<void>
}

const initialForm = (user: UsersType | undefined, roles: UserRoleSummary[]): UserFormState => ({
  fullName: user?.fullName ?? '',
  email: user?.email ?? '',
  roleId: user?.roles[0]?.roleId ?? roles[0]?.roleId ?? ''
})

const UserDialog = ({ open, user, roles, submitting = false, errors = [], onClose, onSubmit }: UserDialogProps) => {
  const [form, setForm] = useState(() => initialForm(user, roles))
  const [clientErrors, setClientErrors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setForm(initialForm(user, roles))
      setClientErrors([])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, roles, user])

  const submit = async () => {
    const fullName = form.fullName.trim()
    const email = form.email.trim()
    const validation: string[] = []
    if (!user && !fullName) validation.push('Full name is required.')
    if (fullName.length > 200) validation.push('Full name cannot exceed 200 characters.')
    if (!user && !email) validation.push('Email is required.')
    if (email.length > 320) validation.push('Email cannot exceed 320 characters.')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validation.push('Email must be a valid email address.')
    if (!form.roleId) validation.push('Select a role.')
    setClientErrors(validation)
    if (validation.length) return
    await onSubmit({ fullName, email, roleId: form.roleId })
  }

  const editing = Boolean(user)
  return (
    <KbFormDialog
      open={open}
      title={editing ? 'Change User Role' : 'Add User'}
      description={editing
        ? 'Select the single global KB role that this user should have.'
        : 'Create an active KB user and assign a global role. Authentication identity remains managed by your SSO provider.'}
      submitLabel={editing ? 'Update Role' : 'Create User'}
      submitting={submitting}
      submitDisabled={roles.length === 0}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <KbFormGrid columns={1}>
        <KbValidationSummary errors={[...clientErrors, ...errors]} />
        {editing ? (
          <>
            <Typography variant='body2' color='text.secondary'>
              {user?.fullName} · {user?.email}
            </Typography>
            {user && user.roles.length > 1 && <Typography variant='body2' color='warning.main'>
              This user has multiple existing roles. Saving replaces them with the selected role.
            </Typography>}
          </>
        ) : (
          <>
            <CustomTextField label='Full name' value={form.fullName}
              onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))}
              slotProps={{ htmlInput: { maxLength: 200 } }} required fullWidth />
            <CustomTextField label='Email' type='email' value={form.email}
              onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
              slotProps={{ htmlInput: { maxLength: 320 } }} required fullWidth />
          </>
        )}
        <CustomTextField select label='Global role' value={form.roleId}
          onChange={event => setForm(current => ({ ...current, roleId: event.target.value }))}
          helperText={roles.length ? 'Roles are loaded from the KB database.' : 'No global roles are available.'}
          required disabled={roles.length === 0} fullWidth>
          {roles.map(role => <MenuItem key={role.roleId} value={role.roleId}>{role.roleName}</MenuItem>)}
        </CustomTextField>
      </KbFormGrid>
    </KbFormDialog>
  )
}

export default UserDialog
