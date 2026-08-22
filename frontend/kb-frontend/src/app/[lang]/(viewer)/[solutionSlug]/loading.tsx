import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'

export default function ViewerRouteLoading() {
  return <Stack spacing={5} sx={{ maxInlineSize: 1240, mx: 'auto' }}>
    <Stack spacing={2} sx={{ alignItems: 'center', py: 5 }}>
      <Skeleton width='48%' height={54} />
      <Skeleton width='68%' height={58} sx={{ borderRadius: 2 }} />
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
      {[1, 2, 3].map(item => <Skeleton key={item} variant='rounded' height={210} sx={{ borderRadius: 3 }} />)}
    </Box>
  </Stack>
}
