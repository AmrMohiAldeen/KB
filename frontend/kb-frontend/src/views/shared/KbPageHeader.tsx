'use client'

// React Imports
import type { ReactNode } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

type KbPageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
}

export const KbPageHeader = ({ title, description, actions, eyebrow }: KbPageHeaderProps) => (
  <Box
    sx={theme => ({
      pb: { xs: 3, md: 4 },
      borderBlockEnd: `1px solid ${theme.palette.divider}`
    })}
  >
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={3}
      sx={{
        alignItems: { md: 'flex-start' },
        justifyContent: 'space-between',
        minInlineSize: 0
      }}
    >
      <Box sx={{ minInlineSize: 0 }}>
        {eyebrow && (
          <Typography variant='overline' color='text.secondary' sx={{ fontWeight: 700 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography
          variant='h4'
          color='text.primary'
          sx={{
            fontWeight: 700,
            letterSpacing: 0,
            fontSize: { xs: 24, md: 28 },
            lineHeight: 1.25
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography variant='body1' color='text.secondary' sx={{ maxInlineSize: 780, mt: 1, lineHeight: 1.6 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack
          direction='row'
          spacing={2}
          useFlexGap
          sx={{
            flexWrap: 'wrap',
            justifyContent: { xs: 'flex-start', md: 'flex-end' },
            '& .MuiButton-root': {
              minBlockSize: 44
            },
            '& .lucide': {
              inlineSize: 18,
              blockSize: 18
            }
          }}
        >
          {actions}
        </Stack>
      )}
    </Stack>
  </Box>
)

export default KbPageHeader
