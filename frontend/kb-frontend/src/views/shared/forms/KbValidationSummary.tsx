'use client'

// MUI Imports
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'

type KbValidationSummaryProps = {
  errors: string[]
  title?: string
}

export const KbValidationSummary = ({ errors, title = 'Please review these fields' }: KbValidationSummaryProps) => {
  if (!errors.length) return null

  return (
    <Alert severity='error'>
      <AlertTitle>{title}</AlertTitle>
      <List dense disablePadding>
        {errors.map(error => (
          <ListItem key={error} disablePadding>
            <ListItemText primary={error} />
          </ListItem>
        ))}
      </List>
    </Alert>
  )
}

export default KbValidationSummary
