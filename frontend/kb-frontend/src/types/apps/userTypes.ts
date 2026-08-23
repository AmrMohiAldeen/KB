export type KbUserRole = 'admin' | 'author' | 'reviewer' | 'contributor' | 'viewer'
export type KbUserStatus = 'active' | 'inactive'

export type UserRoleSummary = {
  roleId: string
  roleName: string
}

export type UsersType = {
  userId: string
  email: string
  fullName: string
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
  roles: UserRoleSummary[]
}

export type UserListQuery = {
  search?: string
  role?: string
  status?: KbUserStatus
  page: number
  pageSize: number
  sortBy: string
  sortDirection: 'asc' | 'desc'
}

export type PagedUserResponse = {
  items: UsersType[]
  page: number
  pageSize: number
  totalCount: number
}

