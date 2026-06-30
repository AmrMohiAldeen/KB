'use client'

// React Type Imports
import type { ReactNode } from 'react'

// MUI Imports
import Button from '@mui/material/Button'

// Third-party Imports
import { ClipboardList, FileCheck2, FileClock, Plus, Send } from 'lucide-react'

// Type Imports
import type { ReviewColumnId } from '../types/review'

// Component Imports
import { KbPageShell } from '@/views/shared'
import KbKanbanBoard from '@/views/shared/kanban/KbKanbanBoard'
import KbKanbanColumn, { KbKanbanColumnEmptyState } from '@/views/shared/kanban/KbKanbanColumn'
import KbWorkflowCard from '@/views/shared/kanban/KbWorkflowCard'
import PageHeader from '../shared/components/PageHeader'

// Config Imports
import { reviewColumns } from '../config/review'

// Data Imports
import { emptyReviewCards } from '../data/reviewCards'

// Util Imports
import { getCardsForReviewColumn } from './utils/reviewBoard'

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
  // Vars
  // TODO: connect to backend API.
  // GET /api/kb/review-board should return article requests, drafts, review submissions, and published cards.
  // TODO: add drag/drop workflow updates.
  // Dragging between columns should PATCH /api/kb/articles/{articleId}/workflow-state with rowVersion.
  const cards = emptyReviewCards

  // Render
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
              // TODO: connect to backend API.
            }}
          >
            New Request
          </Button>
        }
      />

      <KbKanbanBoard>
        {reviewColumns.map(column => {
          const columnCards = getCardsForReviewColumn(cards, column.id)

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
