'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import TablePagination from '@mui/material/TablePagination'
import Typography from '@mui/material/Typography'
import { Bell, Check, CheckCheck } from 'lucide-react'

import { KbEmptyState, KbPageShell } from '@/views/shared'
import PageHeader from '../shared/components/PageHeader'
import { describeNotificationApiError, notificationsApi } from '@/lib/api/notificationsApi'
import type { NotificationsApi } from '@/lib/api/notificationsApi'
import type { NotificationResponse } from '@/types/apps/notificationTypes'

type NotificationsPageProps = {
  accessToken: string
  api?: NotificationsApi
}

const pageSize = 20

const iconFor = (type: string) => {
  if (type.includes('Comment')) return 'tabler-message-circle'
  if (type.includes('Lock')) return 'tabler-lock'
  if (type.includes('Published')) return 'tabler-world-check'
  if (type.includes('Approved')) return 'tabler-circle-check'
  if (type.includes('Rejected') || type.includes('Changes')) return 'tabler-alert-circle'
  return 'tabler-file-description'
}

const NotificationsPage = ({ accessToken, api = notificationsApi }: NotificationsPageProps) => {
  const { lang } = useParams<{ lang: string }>()
  const [items, setItems] = useState<NotificationResponse[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(accessToken))
  const [mutatingId, setMutatingId] = useState<string>()
  const [markingAll, setMarkingAll] = useState(false)
  const [errors, setErrors] = useState<string[]>(accessToken ? [] : ['Authentication is required.'])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    if (!accessToken) return () => controller.abort()
    Promise.all([
      api.list(currentPage + 1, pageSize, accessToken, controller.signal),
      api.unreadCount(accessToken, controller.signal)
    ]).then(([list, count]) => {
      if (controller.signal.aborted) return
      setItems(list.items)
      setTotalCount(list.totalCount)
      setUnreadCount(count.unreadCount)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setItems([])
      setTotalCount(0)
      setErrors(describeNotificationApiError(error))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [accessToken, api, currentPage, refreshKey])

  const markRead = useCallback(async (notification: NotificationResponse) => {
    if (!accessToken || notification.isRead || mutatingId) return
    setMutatingId(notification.notificationId)
    setErrors([])
    try {
      const updated = await api.markRead(notification.notificationId, accessToken)
      setItems(current => current.map(item => item.notificationId === updated.notificationId ? updated : item))
      setUnreadCount(current => Math.max(0, current - 1))
    } catch (error) {
      setErrors(describeNotificationApiError(error))
    } finally {
      setMutatingId(undefined)
    }
  }, [accessToken, api, mutatingId])

  const markAllRead = useCallback(async () => {
    if (!accessToken || unreadCount === 0 || markingAll) return
    setMarkingAll(true)
    setErrors([])
    try {
      const result = await api.markAllRead(accessToken)
      const readAt = new Date().toISOString()
      setItems(current => current.map(item => ({ ...item, isRead: true, readAt: item.readAt ?? readAt })))
      setUnreadCount(result.unreadCount)
    } catch (error) {
      setErrors(describeNotificationApiError(error))
    } finally {
      setMarkingAll(false)
    }
  }, [accessToken, api, markingAll, unreadCount])

  return (
    <KbPageShell>
      <PageHeader
        title='Notifications'
        subtitle='Review article workflow, comments, publishing, and editing activity assigned to you.'
        actions={
          <Button
            variant='contained'
            startIcon={markingAll ? <CircularProgress size={16} color='inherit' /> : <CheckCheck size={17} />}
            disabled={!accessToken || unreadCount === 0 || markingAll}
            onClick={markAllRead}
          >
            Mark all as read
          </Button>
        }
      />

      {errors.map(message => (
        <Alert key={message} severity='error' sx={{ mb: 3 }} action={
          <Button color='inherit' size='small' onClick={() => {
            setLoading(true)
            setErrors([])
            setRefreshKey(value => value + 1)
          }}>Retry</Button>
        }>{message}</Alert>
      ))}

      <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center', mb: 3 }}>
        <Chip color={unreadCount > 0 ? 'primary' : 'default'} label={`${unreadCount} unread`} />
        <Typography variant='body2' color='text.secondary'>{totalCount} total</Typography>
      </Stack>

      {loading ? (
        <Stack spacing={2} aria-label='Loading notifications'>
          {[0, 1, 2].map(value => <Skeleton key={value} variant='rounded' height={112} />)}
        </Stack>
      ) : items.length === 0 && errors.length === 0 ? (
        <KbEmptyState
          title='You’re all caught up'
          description='Workflow, comment, publishing, and lock notifications assigned to you will appear here.'
          icon={<Bell />}
        />
      ) : (
        <Stack spacing={2} aria-label='Notifications list'>
          {items.map(notification => (
            <Card
              key={notification.notificationId}
              variant='outlined'
              aria-label={`${notification.isRead ? 'Read' : 'Unread'} notification: ${notification.title}`}
              sx={theme => ({
                borderColor: notification.isRead ? theme.palette.divider : theme.palette.primary.main,
                bgcolor: notification.isRead ? 'background.paper' : 'action.hover'
              })}
            >
              <CardContent>
                <Stack direction='row' spacing={2} sx={{ alignItems: 'flex-start' }}>
                  <Avatar variant='rounded' color='primary'><i className={iconFor(notification.type)} /></Avatar>
                  <Box sx={{ flex: 1, minInlineSize: 0 }}>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography color='text.primary' sx={{ fontWeight: notification.isRead ? 600 : 800 }}>
                        {notification.title}
                      </Typography>
                      {!notification.isRead && <Chip label='Unread' color='primary' size='small' />}
                    </Stack>
                    <Typography variant='body2' color='text.secondary' sx={{ mt: 0.75 }}>
                      {notification.message}
                    </Typography>
                    <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 1 }}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                        .format(new Date(notification.createdAt))}
                    </Typography>
                  </Box>
                  <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
                    {!notification.isRead && (
                      <Button
                        size='small'
                        startIcon={mutatingId === notification.notificationId
                          ? <CircularProgress size={14} /> : <Check size={15} />}
                        disabled={Boolean(mutatingId)}
                        onClick={() => markRead(notification)}
                      >Read</Button>
                    )}
                    {notification.articleId && (
                      <Button
                        size='small'
                        component={Link}
                        href={`/${lang}/editor?articleId=${encodeURIComponent(notification.articleId)}`}
                      >Open article</Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {!loading && totalCount > pageSize && (
        <TablePagination
          component='div'
          count={totalCount}
          page={currentPage}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
          onPageChange={(_, value) => {
            setLoading(true)
            setCurrentPage(value)
          }}
        />
      )}
    </KbPageShell>
  )
}

export default NotificationsPage
