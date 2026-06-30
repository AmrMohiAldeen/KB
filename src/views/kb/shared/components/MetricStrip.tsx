'use client'

// MUI Imports
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

// Type Imports
import type { KbMetric } from '../../types/sections'

type MetricStripProps = {
  metrics: KbMetric[]
}

export const MetricStrip = ({ metrics }: MetricStripProps) => {
  if (!metrics.length) return null

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
        gap: 4
      }}
    >
      {metrics.map(metric => (
        <Card
          key={metric.label}
          variant='outlined'
          sx={theme => ({
            borderRadius: 2,
            borderColor: alpha(theme.palette.primary.main, 0.14),
            boxShadow: 'none'
          })}
        >
          <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
            <Typography variant='h5' color='text.primary' sx={{ fontWeight: 700 }}>
              {metric.value}
            </Typography>
            <Typography color='text.primary' sx={{ mt: 1, fontWeight: 600 }}>
              {metric.label}
            </Typography>
            {metric.helper && (
              <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
                {metric.helper}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}

export default MetricStrip
