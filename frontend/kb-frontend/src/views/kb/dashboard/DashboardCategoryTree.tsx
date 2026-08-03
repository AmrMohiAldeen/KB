'use client'

import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'

import type { KbCategoryNode } from '../types/categories'

type DashboardCategoryTreeProps = {
  categories: KbCategoryNode[]
  selectedCategoryId: string
  loading?: boolean
  onSelect: (categoryId: string) => void
}

type DashboardCategoryNodeProps = {
  node: KbCategoryNode
  depth: number
  expandedIds: Set<string>
  selectedCategoryId: string
  onToggle: (categoryId: string) => void
  onSelect: (categoryId: string) => void
}

const DashboardCategoryNode = ({
  node,
  depth,
  expandedIds,
  selectedCategoryId,
  onToggle,
  onSelect
}: DashboardCategoryNodeProps) => {
  const hasChildren = Boolean(node.children?.length)
  const expanded = expandedIds.has(node.id)

  return (
    <Box component='li' sx={{ listStyle: 'none' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', pl: depth * 1.5 }}>
        {hasChildren ? (
          <Tooltip title={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}>
            <IconButton
              size='small'
              onClick={() => onToggle(node.id)}
              aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
              aria-expanded={expanded}
              sx={{ mr: 0.25, inlineSize: 28, blockSize: 28 }}
            >
              <ChevronRight
                size={15}
                aria-hidden='true'
                style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}
              />
            </IconButton>
          </Tooltip>
        ) : (
          <Box sx={{ inlineSize: 30, flexShrink: 0 }} />
        )}
        <ListItemButton
          dense
          selected={selectedCategoryId === node.id}
          onClick={() => onSelect(node.id)}
          sx={theme => ({
            minInlineSize: 0,
            minBlockSize: 34,
            gap: 1.25,
            borderRadius: 1.25,
            px: 1.5,
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
            '&.Mui-selected': {
              bgcolor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1)`,
              color: 'primary.main',
              '&:hover': { bgcolor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.14)` }
            }
          })}
        >
          {expanded ? <FolderOpen size={17} aria-hidden='true' /> : <Folder size={17} aria-hidden='true' />}
          <ListItemText
            primary={node.name}
            slotProps={{ primary: { variant: 'body2', noWrap: true, sx: { fontWeight: selectedCategoryId === node.id ? 700 : 500 } } }}
            sx={{ minInlineSize: 0, m: 0 }}
          />
          <Typography
            component='span'
            variant='caption'
            color='inherit'
            sx={{ minInlineSize: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
          >
            {node.articleCount}
          </Typography>
        </ListItemButton>
      </Box>
      {hasChildren && (
        <Collapse in={expanded} timeout='auto' unmountOnExit>
          <List component='ul' disablePadding aria-label={`${node.name} subcategories`}>
            {node.children.map(child => (
              <DashboardCategoryNode
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                selectedCategoryId={selectedCategoryId}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </Box>
  )
}

const DashboardCategoryTree = ({
  categories,
  selectedCategoryId,
  loading = false,
  onSelect
}: DashboardCategoryTreeProps) => {
  const [expansion, setExpansion] = useState<{ initialized: boolean; ids: Set<string> }>({
    initialized: false,
    ids: new Set()
  })
  const expandedIds = useMemo(
    () => expansion.initialized ? expansion.ids : new Set(categories.map(category => category.id)),
    [categories, expansion]
  )

  const toggle = (categoryId: string) => {
    setExpansion(() => {
      const next = new Set(expandedIds)

      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)

      return { initialized: true, ids: next }
    })
  }

  if (loading) {
    return (
      <Box aria-label='Loading categories' sx={{ display: 'grid', gap: 0.75, px: 1 }}>
        {[92, 78, 86, 66].map((width, index) => (
          <Skeleton key={width} variant='rounded' height={32} width={`${width}%`} sx={{ ml: index % 2 ? 3 : 0 }} />
        ))}
      </Box>
    )
  }

  if (!categories.length) {
    return <Typography variant='body2' color='text.secondary'>No categories available.</Typography>
  }

  return (
    <List component='ul' disablePadding aria-label='Category navigation'>
      {categories.map(category => (
        <DashboardCategoryNode
          key={category.id}
          node={category}
          depth={0}
          expandedIds={expandedIds}
          selectedCategoryId={selectedCategoryId}
          onToggle={toggle}
          onSelect={onSelect}
        />
      ))}
    </List>
  )
}

export default DashboardCategoryTree
