// View Imports
import UsersManagementPage from '@/views/kb/users/UsersManagementPage'

export default async function UsersPage() {
  const accessToken = process.env.KB_DEV_ACCESS_TOKEN
  if (!accessToken) throw new Error('KB_DEV_ACCESS_TOKEN is not set')
  return <UsersManagementPage accessToken={accessToken} />
}
