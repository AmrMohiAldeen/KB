'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Divider from '@mui/material/Divider'
import Fade from '@mui/material/Fade'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Skeleton from '@mui/material/Skeleton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import PerfectScrollbar from 'react-perfect-scrollbar'

import type { Locale } from '@configs/i18n'
import CustomAvatar from '@core/components/mui/Avatar'
import themeConfig from '@configs/themeConfig'
import { useSettings } from '@core/hooks/useSettings'
import { notificationsApi } from '@/lib/api/notificationsApi'
import { describeApiError } from '@/lib/api/http'
import type { NotificationResponse } from '@/types/apps/notificationTypes'
import { getLocalizedUrl } from '@/utils/i18n'

export type NotificationsType = NotificationResponse

const ScrollWrapper = ({ children, hidden }: { children: ReactNode; hidden: boolean }) => hidden
  ? <div className='overflow-x-hidden max-bs-[420px]'>{children}</div>
  : <PerfectScrollbar className='max-bs-[420px]' options={{ wheelPropagation: false, suppressScrollX: true }}>
      {children}
    </PerfectScrollbar>

const iconFor = (type: string) => {
  if (type.includes('Comment')) return 'tabler-message-circle'
  if (type.includes('Lock')) return 'tabler-lock'
  if (type.includes('Published')) return 'tabler-world-check'
  if (type.includes('Approved')) return 'tabler-circle-check'
  if (type.includes('Rejected') || type.includes('Changes')) return 'tabler-alert-circle'
  return 'tabler-file-description'
}

const NotificationsDropdown = ({ accessToken }: { accessToken: string }) => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationResponse[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(accessToken))
  const [error, setError] = useState('')
  const [mutating, setMutating] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null)
  const hidden = useMediaQuery((theme: Theme) => theme.breakpoints.down('lg'))
  const isSmallScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const { settings } = useSettings()
  const { lang: locale } = useParams<{ lang: Locale }>()

  const load = useCallback((signal?: AbortSignal, prepare = true) => {
    if (!accessToken) {
      return Promise.resolve()
    }
    if (prepare) {
      setLoading(true)
      setError('')
    }
    return Promise.all([
      notificationsApi.list(1, 6, accessToken, signal),
      notificationsApi.unreadCount(accessToken, signal)
    ]).then(([list, count]) => {
      setItems(list.items)
      setUnreadCount(count.unreadCount)
    }).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(describeApiError(reason)[0])
    }).finally(() => setLoading(false))
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    if (!accessToken) return () => controller.abort()
    Promise.all([
      notificationsApi.list(1, 6, accessToken, controller.signal),
      notificationsApi.unreadCount(accessToken, controller.signal)
    ]).then(([list, count]) => {
      if (controller.signal.aborted) return
      setItems(list.items)
      setUnreadCount(count.unreadCount)
    }).catch(reason => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(describeApiError(reason)[0])
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [accessToken])

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
    setOpen(value => !value)
  }

  const markRead = async (notification: NotificationResponse) => {
    if (!accessToken || notification.isRead || mutating) return
    setMutating(true)
    try {
      const updated = await notificationsApi.markRead(notification.notificationId, accessToken)
      setItems(current => current.map(item => item.notificationId === updated.notificationId ? updated : item))
      setUnreadCount(current => Math.max(0, current - 1))
    } catch (reason) {
      setError(describeApiError(reason)[0])
    } finally {
      setMutating(false)
    }
  }

  const markAllRead = async () => {
    if (!accessToken || unreadCount === 0 || mutating) return
    setMutating(true)
    try {
      const result = await notificationsApi.markAllRead(accessToken)
      const readAt = new Date().toISOString()
      setItems(current => current.map(item => ({ ...item, isRead: true, readAt: item.readAt ?? readAt })))
      setUnreadCount(result.unreadCount)
    } catch (reason) {
      setError(describeApiError(reason)[0])
    } finally {
      setMutating(false)
    }
  }

  return (
    <>
      <IconButton onClick={handleToggle} className='text-textPrimary' aria-label='Notifications'>
        <Badge color='error' badgeContent={unreadCount} max={99} invisible={unreadCount === 0} overlap='circular'>
          <i className='tabler-bell' />
        </Badge>
      </IconButton>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        anchorEl={anchorEl}
        {...(isSmallScreen ? {
          className: 'is-full !mbs-3 z-[1]',
          modifiers: [{ name: 'preventOverflow', options: { padding: themeConfig.layoutPadding } }]
        } : { className: 'is-96 !mbs-3 z-[1]' })}
      >
        {({ TransitionProps, placement }) => (
          <Fade {...TransitionProps} style={{ transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top' }}>
            <Paper className={settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg'}>
              <ClickAwayListener onClickAway={() => setOpen(false)}>
                <div>
                  <div className='flex items-center justify-between plb-3 pli-4 is-full gap-2'>
                    <Typography variant='h6' className='flex-auto'>Notifications</Typography>
                    {unreadCount > 0 && <Chip size='small' variant='tonal' color='primary' label={`${unreadCount} New`} />}
                    <Tooltip title='Mark all as read'>
                      <span>
                        <IconButton size='small' disabled={unreadCount === 0 || mutating} onClick={markAllRead}>
                          {mutating ? <CircularProgress size={17} /> : <i className='tabler-mail-opened' />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </div>
                  <Divider />
                  <ScrollWrapper hidden={hidden}>
                    {loading ? (
                      <div className='p-4'><Skeleton height={72} /><Skeleton height={72} /><Skeleton height={72} /></div>
                    ) : error ? (
                      <Alert severity='error' sx={{ m: 2 }} action={
                        <Button color='inherit' size='small' onClick={() => void load()}>Retry</Button>
                      }>{error}</Alert>
                    ) : items.length === 0 ? (
                      <div className='p-6 text-center'>
                        <Typography color='text.primary' className='font-medium'>You’re all caught up</Typography>
                        <Typography variant='caption' color='text.secondary'>No notifications to show.</Typography>
                      </div>
                    ) : items.map((notification, index) => (
                      <div
                        key={notification.notificationId}
                        className={`flex plb-3 pli-4 gap-3 cursor-pointer hover:bg-actionHover ${index !== items.length - 1 ? 'border-be' : ''}`}
                        onClick={() => void markRead(notification)}
                      >
                        <CustomAvatar color='primary' skin='light-static'><i className={iconFor(notification.type)} /></CustomAvatar>
                        <div className='flex flex-col flex-auto min-is-0'>
                          <Typography variant='body2' className='font-medium mbe-1' color='text.primary'>{notification.title}</Typography>
                          <Typography variant='caption' color='text.secondary' className='mbe-2'>{notification.message}</Typography>
                          <Typography variant='caption' color='text.disabled'>
                            {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                              .format(new Date(notification.createdAt))}
                          </Typography>
                        </div>
                        {!notification.isRead && <Badge variant='dot' color='primary' className='mbs-1 mie-1' />}
                      </div>
                    ))}
                  </ScrollWrapper>
                  <Divider />
                  <div className='p-4'>
                    <Button fullWidth variant='contained' size='small' component={Link}
                      href={getLocalizedUrl('/notifications', locale)} onClick={() => setOpen(false)}>
                      View All Notifications
                    </Button>
                  </div>
                </div>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default NotificationsDropdown
