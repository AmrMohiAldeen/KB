'use client'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ClipboardList, MoreVertical, Plus } from 'lucide-react'

import { PageHeader, StatusChip, articleStatusColor } from './KbShared'
import { reviewCards } from './kbMockData'
import type { ReviewColumnId } from './kbMockData'

const columns: Array<{ id: ReviewColumnId; title: string; tone: string }> = [
  { id: 'requests', title: 'Article Requests', tone: 'var(--mui-palette-info-lightOpacity)' },
  { id: 'drafts', title: 'Draft Articles', tone: 'var(--mui-palette-secondary-lightOpacity)' },
  { id: 'review', title: 'Articles in Review', tone: 'var(--mui-palette-warning-lightOpacity)' },
  { id: 'published', title: 'Published Articles', tone: 'var(--mui-palette-success-lightOpacity)' }
]

const ReviewPlannerBoard = () => {
  // TODO: connect to backend review APIs.
  // GET /api/kb/review-board should return article requests, drafts, review submissions, and published cards.
  // TODO: add drag/drop workflow updates.
  // Dragging between columns should PATCH /api/kb/articles/{articleId}/workflow-state with rowVersion.
  return (
    <Stack spacing={6}>
      <PageHeader
        title='Article Planner'
        subtitle='Track requests, drafts, reviews, and published work across the editorial workflow.'
        actions={
          <Button
            variant='contained'
            startIcon={<Plus size={18} />}
            onClick={() => {
              // TODO: connect to backend article request API.
            }}
          >
            New Request
          </Button>
        }
      />

      <Box className='grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-4'>
        {columns.map(column => {
          const cards = reviewCards.filter(card => card.columnId === column.id)

          return (
            <Box
              key={column.id}
              className='min-bs-[520px] rounded border p-4'
              sx={{ backgroundColor: column.tone }}
            >
              <Box className='mbe-4 flex items-center justify-between gap-3'>
                <Box className='flex items-center gap-2'>
                  <ClipboardList size={18} />
                  <Typography variant='h6'>{column.title}</Typography>
                </Box>
                <Box className='flex items-center gap-2 text-textSecondary'>
                  <Typography variant='body2'>{cards.length}</Typography>
                  <MoreVertical size={18} />
                </Box>
              </Box>

              <Stack spacing={3}>
                {cards.map(card => (
                  <Card key={card.id} variant='outlined'>
                    <CardContent className='p-4'>
                      <Stack spacing={3}>
                        <Box>
                          <Typography color='text.primary' className='font-medium'>
                            {card.title}
                          </Typography>
                          <Typography variant='body2' color='text.secondary'>
                            Updated {card.updatedAt}
                          </Typography>
                        </Box>
                        <Box className='flex items-center justify-between gap-3'>
                          <Typography variant='body2' color='text.secondary'>
                            {card.owner}
                          </Typography>
                          {card.status === 'Request' ? (
                            <StatusChip label='Request' color='info' />
                          ) : (
                            <StatusChip label={card.status} color={articleStatusColor[card.status]} />
                          )}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Box>
          )
        })}
      </Box>
    </Stack>
  )
}

export default ReviewPlannerBoard

