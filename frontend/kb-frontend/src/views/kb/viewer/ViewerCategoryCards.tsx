'use client'

import { useEffect, useState, type DragEvent } from 'react'
import Link from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ArrowRight } from 'lucide-react'

import { renderCategoryViewerIcon } from '@/views/kb/categories/categoryViewerIcons'
import type { ViewerCategoryNode } from '@/lib/api/viewerKnowledgeBaseApi'
import type { ViewerDashboardAppearance } from '@/lib/api/viewerDashboardSettingsApi'

export type CategoryImageLoader = (category: ViewerCategoryNode, signal: AbortSignal) => Promise<Blob>

export function ViewerCategoryArtwork({ category, getImage }: {
  category: ViewerCategoryNode
  getImage?: CategoryImageLoader
}) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!category.hasViewerImage || !getImage) return
    const controller = new AbortController()
    let objectUrl = ''
    getImage(category, controller.signal).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setSource(objectUrl)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [category, getImage])

  if (category.hasViewerImage && getImage && !source && !failed)
    return <Skeleton variant='rounded' sx={{ inlineSize: 72, blockSize: 72, borderRadius: 2 }} />
  if (source && !failed) return <Box component='img' src={source} alt='' loading='lazy' onError={() => setFailed(true)}
    sx={{ inlineSize: 84, blockSize: 84, borderRadius: 2, objectFit: 'cover' }} />
  return <Box sx={{ inlineSize: 72, blockSize: 72, borderRadius: 2, display: 'grid', placeItems: 'center',
    bgcolor: category.displayColor ?? 'action.hover', color: 'primary.main' }}>
    {renderCategoryViewerIcon(category.viewerIcon, { size: 34, strokeWidth: 1.8 })}
  </Box>
}

export default function ViewerCategoryCards({ categories, appearance, rootPath, getImage, draggable = false,
  onDragStart, onDragOver, onDrop, onEdit }: {
  categories: ViewerCategoryNode[]
  appearance: ViewerDashboardAppearance
  rootPath?: string
  getImage?: CategoryImageLoader
  draggable?: boolean
  onDragStart?: (categoryId: string) => void
  onDragOver?: (categoryId: string) => void
  onDrop?: (categoryId: string) => void
  onEdit?: (category: ViewerCategoryNode) => void
}) {
  return <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 3 }}>
    {categories.map(category => <Card key={category.categoryId}
      component={rootPath ? Link : 'div'} href={rootPath ? `${rootPath}/categories/${category.slug}` : undefined}
      variant='outlined' draggable={draggable}
      onDragStart={() => onDragStart?.(category.categoryId)} onDragOver={(event: DragEvent<HTMLDivElement>) => { if (draggable) event.preventDefault(); onDragOver?.(category.categoryId) }}
      onDrop={() => onDrop?.(category.categoryId)} onClick={() => onEdit?.(category)}
      sx={{ minBlockSize: 210, p: 3, display: 'flex', flexDirection: 'column', color: appearance.textColor,
        bgcolor: appearance.categoryCardBackgroundColor, textDecoration: 'none', borderRadius: 3,
        cursor: draggable ? 'grab' : undefined, borderTop: `5px solid ${category.displayColor ?? appearance.primaryColor}`,
        transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
        '&:hover': { borderColor: appearance.primaryColor, boxShadow: 4, transform: 'translateY(-3px)' },
        '&:focus-visible': { outline: `3px solid ${appearance.primaryColor}`, outlineOffset: 3 } }}>
      <ViewerCategoryArtwork category={category} getImage={getImage} />
      <Box sx={{ mt: 3, flex: 1 }}><Typography variant='h6'>{category.name}</Typography>
        {category.description && <Typography variant='body2' color='text.secondary' sx={{ mt: 0.75 }}>{category.description}</Typography>}
      </Box>
      <Stack direction='row' spacing={1} sx={{ alignItems: 'center', mt: 2, color: appearance.primaryColor }}>
        <Typography variant='body2' sx={{ fontWeight: 600 }}>{draggable ? 'Drag to reorder · Click to edit' : 'Explore'}</Typography><ArrowRight size={16} />
      </Stack>
    </Card>)}
  </Box>
}
