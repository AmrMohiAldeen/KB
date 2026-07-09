'use client'

import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { FileText } from 'lucide-react'

import KbStatusChip from '../KbStatusChip'

type KbWorkflowCardProps = {
  title: string
  ownerName: string
  status: string
  updatedAt: string
}

export const KbWorkflowCard = ({ title, ownerName, status, updatedAt }: KbWorkflowCardProps) => (
  <Card variant='outlined' sx={{ boxShadow: 'none', borderRadius: 2 }}>
    <CardContent sx={{ p: 4, '&:last-child': { pb: 4 } }}>
      <Stack spacing={3}>
        <Stack direction='row' spacing={2} sx={{ alignItems: 'flex-start' }}>
          <FileText size={18} color='var(--mui-palette-text-secondary)' />
          <Stack spacing={0.75} sx={{ minInlineSize: 0 }}>
            <Typography color='text.primary' sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              Updated {updatedAt}
            </Typography>
          </Stack>
        </Stack>
        <Stack direction='row' spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant='body2' color='text.secondary' noWrap>
            {ownerName}
          </Typography>
          <KbStatusChip label={status} />
        </Stack>
      </Stack>
    </CardContent>
  </Card>
)

export default KbWorkflowCard
