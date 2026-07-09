'use client'

import type { ReactNode } from 'react'

import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'

type KbSectionCardProps = {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  contentSx?: SxProps<Theme>
  sx?: SxProps<Theme>
}

export const KbSectionCard = ({ title, description, actions, children, contentSx, sx }: KbSectionCardProps) => (
  <Card
    variant='outlined'
    sx={{
      overflow: 'hidden',
      borderRadius: 2,
      bgcolor: 'background.paper',
      boxShadow: 'none',
      ...sx
    }}
  >
    <CardContent sx={{ p: { xs: 4, md: 5 }, '&:last-child': { pb: { xs: 4, md: 5 } }, ...contentSx }}>
      {(title || description || actions) && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={3}
          sx={{
            alignItems: { sm: 'flex-start' },
            justifyContent: 'space-between',
            mb: 4
          }}
        >
          <Box>
            {title && (
              <Typography variant='h6' color='text.primary' sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
            )}
            {description && (
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5, lineHeight: 1.6 }}>
                {description}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction='row' spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {actions}
            </Stack>
          )}
        </Stack>
      )}
      {children}
    </CardContent>
  </Card>
)

export default KbSectionCard
