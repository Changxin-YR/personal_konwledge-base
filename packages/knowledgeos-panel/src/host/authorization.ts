import type { SessionActor } from './identity.ts'

export const AUTH_ACTIONS = ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records'] as const
export type AuthorizationAction = typeof AUTH_ACTIONS[number]
export type ResourceScope = 'personal' | 'project'

export interface AuthorizationTarget {
  readonly serviceId: string
  readonly spaceId: string
  readonly objectId: string
  readonly scope: ResourceScope
  readonly ownerUserId: string
  readonly projectId?: string
  readonly status: string
}

export interface AuthorizationGrant {
  readonly subjectType: 'user' | 'project'
  readonly subjectId: string
  readonly action: AuthorizationAction
  readonly validFrom: string
  readonly expiresAt?: string
  readonly revokedAt?: string
}

export interface ProjectMembership {
  readonly projectId: string
  readonly userId: string
  readonly role: string
  readonly validFrom: string
  readonly expiresAt?: string
  readonly revokedAt?: string
}

export function isGrantActive(grant: Pick<AuthorizationGrant, 'validFrom' | 'expiresAt' | 'revokedAt'>, now: string): boolean {
  return grant.revokedAt === undefined && grant.validFrom <= now && (grant.expiresAt === undefined || now < grant.expiresAt)
}

/**
 * The only domain authorization decision point. Callers must supply the
 * server generated actor, the service/object target and the current server
 * time. Missing or stale grants are denied by default.
 */
export function authorize(
  actor: SessionActor,
  target: AuthorizationTarget,
  action: AuthorizationAction,
  now: string,
  grants: readonly AuthorizationGrant[] = [],
  memberships: readonly ProjectMembership[] = [],
): boolean {
  if (target.status !== 'active' || target.serviceId !== actor.serviceId || target.spaceId !== actor.personalSpaceId && target.scope === 'personal') return false
  if (target.scope === 'personal') return target.ownerUserId === actor.userId
  if (target.projectId === undefined) return false
  const member = memberships.some(item => item.projectId === target.projectId && item.userId === actor.userId && isGrantActive(item, now))
  if (!member && target.ownerUserId !== actor.userId) return false
  return grants.some(item => item.subjectType === 'user' && item.subjectId === actor.userId && item.action === action && isGrantActive(item, now))
    || grants.some(item => item.subjectType === 'project' && item.subjectId === target.projectId && item.action === action && isGrantActive(item, now) && member)
}
