import type { SessionActor } from './identity.ts'

export const AUTH_ACTIONS = ['read', 'comment', 'edit', 'export', 'manage_share', 'delete', 'review', 'view_learning_records'] as const
export type AuthorizationAction = typeof AUTH_ACTIONS[number]
export type ResourceScope = 'personal' | 'project'
export type AuthorizationPrincipal = Pick<SessionActor, 'userId' | 'serviceId' | 'personalSpaceId'>

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
function horizon(rows:readonly Pick<AuthorizationGrant,'validFrom'|'expiresAt'|'revokedAt'>[],now:string):string|null|undefined {
  let latest:string|undefined
  for(const row of rows){
    if(!isGrantActive(row,now))continue
    if(row.expiresAt===undefined)return null
    if(latest===undefined||row.expiresAt>latest)latest=row.expiresAt
  }
  return latest
}

export function authorizationHorizon(
  actor: AuthorizationPrincipal,
  target: AuthorizationTarget,
  action: AuthorizationAction,
  now: string,
  grants: readonly AuthorizationGrant[] = [],
  memberships: readonly ProjectMembership[] = [],
  documentInvitations: readonly AuthorizationGrant[] = [],
): string|null|undefined {
  if (target.status !== 'active' || target.serviceId !== actor.serviceId) return
  const invited = action === 'read' || action === 'edit' ? documentInvitations.filter(item =>
    item.subjectType === 'user' && item.subjectId === actor.userId && item.action === action) : []
  if (target.scope === 'personal') return target.spaceId === actor.personalSpaceId && target.ownerUserId === actor.userId ? null : horizon(invited,now)
  if (target.projectId === undefined) return
  const member = horizon(memberships.filter(item => item.projectId === target.projectId && item.userId === actor.userId),now)
  if (member === undefined) return
  const grant = horizon([...invited,...grants.filter(item=>item.action===action&&
    (item.subjectType === 'user' && item.subjectId === actor.userId || item.subjectType === 'project' && item.subjectId === target.projectId))],now)
  if(grant===undefined)return
  if(member===null)return grant
  if(grant===null)return member
  return grant<member?grant:member
}

export function authorize(...args:Parameters<typeof authorizationHorizon>):boolean {return authorizationHorizon(...args)!==undefined}
