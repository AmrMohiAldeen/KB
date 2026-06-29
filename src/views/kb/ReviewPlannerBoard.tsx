'use client'

import type { ReactNode } from 'react'

import Button from '@mui/material/Button'
import { ClipboardList, FileCheck2, FileClock, Plus, Send } from 'lucide-react'

import KbKanbanBoard from '@/views/shared/kanban/KbKanbanBoard'
import KbKanbanColumn, { KbKanbanColumnEmptyState } from '@/views/shared/kanban/KbKanbanColumn'
import KbWorkflowCard from '@/views/shared/kanban/KbWorkflowCard'

import { KbPageShell, PageHeader } from './KbShared'
import { emptyReviewCards, reviewColumns } from './kbMockData'
import type { ReviewColumnId } from './kbMockData'

const columnTones: Record<ReviewColumnId, 'info' | 'secondary' | 'warning' | 'success'> = {
  requests: 'info',
  drafts: 'secondary',
  review: 'warning',
  published: 'success'
}

const columnIcons: Record<ReviewColumnId, ReactNode> = {
  requests: <ClipboardList />,
  drafts: <FileClock />,
  review: <Send />,
  published: <FileCheck2 />
}

const ReviewPlannerBoard = () => {
  // TODO: connect to backend review APIs.
  // GET /api/kb/review-board should return article requests, drafts, review submissions, and published cards.
  // TODO: add drag/drop workflow updates.
  // Dragging between columns should PATCH /api/kb/articles/{articleId}/workflow-state with rowVersion.
  const cards = emptyReviewCards

  return (
    <KbPageShell maxWidth='100%'>
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

      <KbKanbanBoard>
        {reviewColumns.map(column => {
          const columnCards = cards.filter(card => card.columnId === column.id)

          return (
            <KbKanbanColumn
              key={column.id}
              title={column.title}
              count={columnCards.length}
              icon={columnIcons[column.id]}
              tone={columnTones[column.id]}
            >
              {columnCards.map(card => (
                <KbWorkflowCard
                  key={card.id}
                  title={card.title}
                  ownerName={card.ownerName}
                  status={card.status}
                  updatedAt={card.updatedAt}
                />
              ))}
              {!columnCards.length && <KbKanbanColumnEmptyState />}
            </KbKanbanColumn>
          )
        })}
      </KbKanbanBoard>
    </KbPageShell>
  )
}

export default ReviewPlannerBoard
