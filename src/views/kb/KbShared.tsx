import type { ReactNode } from 'react'

import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ChipProps } from '@mui/material/Chip'
import { Folder, Search } from 'lucide-react'

import type { ArticleStatus, KbCategoryNode } from './kbMockData'

export const articleStatusColor: Record<ArticleStatus, ChipProps['color']> = {
  Published: 'success',
  Draft: 'default',
  'To Review': 'warning',
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
}) => (
  <Box className='flex flex-col gap-4 md:flex-row md:items-start md:justify-between'>
    <Box>
      <Typography variant='h4' color='text.primary'>
        {title}
      </Typography>
      {subtitle && (
        <Typography color='text.secondary' className='max-is-[760px]'>
          {subtitle}
        </Typography>
      )}
    </Box>
    {actions && (
      <Stack direction='row' spacing={2} className='flex-wrap justify-start md:justify-end'>
        {actions}
      </Stack>
    )}
  </Box>
)

export const StatusChip = ({
  label,
  color
}: {
  label: string
  color?: ChipProps['color']
}) => <Chip size='small' label={label} color={color ?? 'default'} variant='tonal' />

export const MetricStrip = ({ metrics }: { metrics: Array<{ label: string; value: string; helper?: string }> }) => (
  <Box className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
    {metrics.map(metric => (
      <Card key={metric.label} variant='outlined'>
        <CardContent>
          <Typography variant='h5'>{metric.value}</Typography>
          <Typography color='text.primary'>{metric.label}</Typography>
          {metric.helper && (
            <Typography variant='body2' color='text.secondary'>
              {metric.helper}
            </Typography>
          )}
        </CardContent>
      </Card>
    ))}
  </Box>
)

export const EmptyState = ({
  title,
  body,
  action
}: {
  title: string
  body: string
  action?: ReactNode
}) => (
  <Box className='flex flex-col items-center justify-center gap-3 rounded border border-dashed p-8 text-center'>
    <Avatar variant='rounded' className='bg-[var(--mui-palette-primary-lightOpacity)] text-primary'>
      <Search size={20} />
    </Avatar>
    <Box>
      <Typography variant='h6'>{title}</Typography>
      <Typography color='text.secondary'>{body}</Typography>
    </Box>
    {action}
  </Box>
)

const CategoryNode = ({ node, depth = 0 }: { node: KbCategoryNode; depth?: number }) => (
  <Stack spacing={1} className={depth > 0 ? 'pis-5' : undefined}>
    <Box className='flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-actionHover'>
      <Box className='flex min-is-0 items-center gap-2'>
        <Folder size={16} className='shrink-0 text-textSecondary' />
        <Typography variant='body2' color='text.primary' noWrap>
          {node.name}
        </Typography>
      </Box>
      <Typography variant='caption' color='text.secondary'>
        {node.articleCount}
      </Typography>
    </Box>
    {node.children?.map(child => <CategoryNode key={child.id} node={child} depth={depth + 1} />)}
  </Stack>
)

export const CategoryTree = ({ categories }: { categories: KbCategoryNode[] }) => (
  <Stack spacing={1}>
    {categories.map(category => (
      <CategoryNode key={category.id} node={category} />
    ))}
  </Stack>
)

export const PlaceholderButton = ({
  children,
  startIcon
}: {
  children: ReactNode
  startIcon?: ReactNode
}) => (
  <Button variant='outlined' disabled startIcon={startIcon}>
    {children}
  </Button>
)
