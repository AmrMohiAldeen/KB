'use client'

import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import { ChevronRight, Folder } from 'lucide-react'

import type { KbCategoryNode } from '../../types/categories'
import EmptyState from './EmptyState'

type CategoryNodeProps = {
  node: KbCategoryNode
  depth?: number
}

type CategoryTreeProps = {
  categories: KbCategoryNode[]
  compact?: boolean
}

const CategoryNode = ({ node, depth = 0 }: CategoryNodeProps) => (
  <Box sx={{ pl: depth ? 3 : 0 }}>
    <ListItemButton
      dense
      sx={theme => ({
        minBlockSize: 36,
        gap: 1.5,
        borderRadius: 'var(--mui-shape-customBorderRadius-md)',
        color: theme.palette.text.primary,
        '& .MuiListItemIcon-root': {
          minInlineSize: 0,
          color: 'var(--mui-palette-primary-main)'
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

export const CategoryTree = ({ categories, compact = false }: CategoryTreeProps) => {
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

export default CategoryTree
