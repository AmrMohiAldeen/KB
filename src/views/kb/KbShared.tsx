'use client'

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'
import type { ChipProps } from '@mui/material/Chip'
import { ChevronRight, Folder } from 'lucide-react'

import {
  KbEmptyState,
  KbPageHeader,
  KbPageShell,
  KbSectionCard,
  KbStatusChip
} from '@/views/shared'

import type { ArticleStatus, KbCategoryNode } from './kbMockData'

export const articleStatusColor: Record<ArticleStatus, ChipProps['color']> = {
  Published: 'success',
  Draft: 'secondary',
  Submitted: 'info',
  'To Review': 'warning',
  'In Review': 'warning',
  'Changes Requested': 'warning',
  Approved: 'success',
  Archived: 'secondary'
}

export const roleLabels = {
  admin: 'Admin',
  author: 'Author',
  reviewer: 'Reviewer',
  contributor: 'Contributor',
  viewer: 'Viewer'
} as const

export const formatDate = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

export const PageHeader = ({
  title,
  subtitle,
  actions
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) => <KbPageHeader title={title} description={subtitle} actions={actions} />

export { KbPageShell, KbSectionCard }

export const StatusChip = ({ label, color }: { label: string; color?: ChipProps['color'] }) => (
  <KbStatusChip label={label} color={color} />
)

export const MetricStrip = ({ metrics }: { metrics: Array<{ label: string; value: string; helper?: string }> }) => {
  if (!metrics.length) return null

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
        gap: 4
      }}
    >
      {metrics.map(metric => (
        <Card
          key={metric.label}
          variant='outlined'
          sx={theme => ({
            borderRadius: 2,
            borderColor: alpha(theme.palette.primary.main, 0.14),
            boxShadow: 'none'
          })}
        >
          <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
            <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
              {metric.value}
            </Typography>
            <Typography color='text.primary' sx={{ mt: 1, fontWeight: 600 }}>
              {metric.label}
            </Typography>
            {metric.helper && (
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                {metric.helper}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}

export const EmptyState = ({
  title,
  body,
  action,
  compact = false
}: {
  title: string
  body: string
  action?: ReactNode
  compact?: boolean
}) => <KbEmptyState compact={compact} title={title} description={body} action={action} />

const CategoryNode = ({ node, depth = 0 }: { node: KbCategoryNode; depth?: number }) => (
  <Box sx={{ pl: depth ? 3 : 0 }}>
    <ListItemButton
      dense
      sx={theme => ({
        minBlockSize: 36,
        gap: 1.5,
        borderRadius: 1.5,
        color: theme.palette.text.primary,
        '& .MuiListItemIcon-root': {
          minInlineSize: 0
        }
      })}
    >
      <ListItemIcon>
        <Folder size={16} />
      </ListItemIcon>
      <ListItemText
        primary={node.name}
        slotProps={{ primary: { variant: 'body2', noWrap: true } }}
        sx={{ minInlineSize: 0, m: 0 }}
      />
      <Typography variant='caption' color='text.secondary'>
        {node.articleCount}
      </Typography>
      {Boolean(node.children?.length) && <ChevronRight size={14} />}
    </ListItemButton>
    {node.children?.map(child => <CategoryNode key={child.id} node={child} depth={depth + 1} />)}
  </Box>
)

export const CategoryTree = ({ categories, compact = false }: { categories: KbCategoryNode[]; compact?: boolean }) => {
  if (!categories.length) {
    return (
      <EmptyState
        compact={compact}
        title='No categories yet'
        body='Categories will appear here after they are loaded from the backend.'
      />
    )
  }

  return (
    <List disablePadding sx={{ display: 'grid', gap: 0.5 }}>
      {categories.map(category => (
        <CategoryNode key={category.id} node={category} />
      ))}
    </List>
  )
}

export const PlaceholderButton = ({ children, startIcon }: { children: ReactNode; startIcon?: ReactNode }) => (
  <Button variant='outlined' disabled startIcon={startIcon}>
    {children}
  </Button>
)
