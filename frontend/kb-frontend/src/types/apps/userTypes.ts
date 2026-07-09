export type KbUserRole = 'admin' | 'author' | 'reviewer' | 'contributor' | 'viewer'
export type KbUserStatus = 'active' | 'inactive'

export type UsersType = {
  id: string
  ssoId: string
  email: string
  fullName: string
  role: KbUserRole
  status: KbUserStatus
  createdAt: string
  lastLoginAt: string | null
}

