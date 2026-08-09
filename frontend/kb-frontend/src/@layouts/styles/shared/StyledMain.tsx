// MUI Imports
import { styled } from '@mui/material/styles'

type StyledMainProps = {
  isContentCompact: boolean
}

const StyledMain = styled('main', {
  shouldForwardProp: prop => prop !== 'isContentCompact'
})<StyledMainProps>(({ isContentCompact }) => ({
  padding: 20,
  backgroundColor: 'var(--mui-palette-background-default)',
  '@media (min-width: 900px)': {
    padding: 32
  },
  ...(isContentCompact && {
    marginInline: 'auto',
    maxInlineSize: 1440
  }),
  '&:has([data-dashboard-full-width])': {
    marginInline: 0,
    maxInlineSize: 'none'
  }
}))

export default StyledMain
