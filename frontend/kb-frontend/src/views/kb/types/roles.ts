// Type Imports
import type { KbPermissionAction } from '@/types/apps/permissionTypes'
import type { KbUserRole } from '@/types/apps/userTypes'

export type RoleDefinition = {
  role: KbUserRole
  label: string
  summary: string
  permissions: KbPermissionAction[]
}

export type PermissionDefinition = {
  key: KbPermissionAction
  label: string
  description: string
}
