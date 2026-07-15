'use client'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ShieldCheck } from 'lucide-react'

type KbRoleCardProps = {
  label: string
  summary: string
  permissions: string[]
  onEdit?: () => void
}

export const KbRoleCard = ({ label, summary, permissions, onEdit }: KbRoleCardProps) => (
  <Card variant='outlined' sx={{ borderRadius: 2, boxShadow: 'none', blockSize: '100%' }}>
    <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
      <Stack spacing={4}>
        <Stack direction='row' spacing={3} sx={{ alignItems: 'flex-start' }}>
          <ShieldCheck size={24} color='var(--mui-palette-primary-main)' />
          <Stack spacing={0.75}>
            <Typography variant='h6' color='text.primary' sx={{ fontWeight: 700 }}>
              {label}
            </Typography>
            <Typography variant='body2' color='text.secondary' sx={{ lineHeight: 1.6 }}>
              {summary}
            </Typography>
          </Stack>
        </Stack>
        <Stack direction='row' spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {permissions.map(permission => (
            <Chip key={permission} label={permission} size='small' variant='tonal' color='primary' />
          ))}
        </Stack>
        {onEdit && (
          <Button variant='outlined' color='secondary' onClick={onEdit}>
            Edit Role
          </Button>
        )}
      </Stack>
    </CardContent>
  </Card>
)

export default KbRoleCard
