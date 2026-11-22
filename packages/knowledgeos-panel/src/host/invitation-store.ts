import {createHash,randomBytes,randomUUID} from 'node:crypto'
import type {DatabaseSync} from 'node:sqlite'
import {AssetError} from './asset-store.ts'
import type {SessionActor} from './identity.ts'
import type {ParseTx} from './parse-store.ts'

export const INVITATION_SCHEMA=`CREATE TABLE invitations (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  service_id TEXT NOT NULL, issuer_id TEXT NOT NULL REFERENCES users(id),
  object_id TEXT REFERENCES knowledge_objects(id), project_id TEXT REFERENCES knowledge_projects(id),
  permission TEXT NOT NULL CHECK(permission IN ('read','edit','member')),
  issued_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>issued_at), revoked_at TEXT,
  max_redemptions INTEGER NOT NULL CHECK(max_redemptions BETWEEN 1 AND 100),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK(redeemed_count BETWEEN 0 AND max_redemptions),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1), request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), UNIQUE(service_id,issuer_id,request_key),
  CHECK((object_id IS NOT NULL AND project_id IS NULL AND permission IN ('read','edit'))
    OR (project_id IS NOT NULL AND object_id IS NULL AND permission='member'))
) STRICT;
CREATE TABLE invitation_redemptions (
  id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitations(id), user_id TEXT NOT NULL REFERENCES users(id),
  redeemed_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>redeemed_at), revoked_at TEXT,
  UNIQUE(invitation_id,user_id)
) STRICT;
CREATE INDEX invitation_redemptions_user ON invitation_redemptions(user_id,invitation_id);
CREATE INDEX invitations_object ON invitations(object_id);
CREATE INDEX invitations_project ON invitations(project_id);
CREATE TABLE invitation_audit (
  invitation_id TEXT NOT NULL REFERENCES invitations(id), revision INTEGER NOT NULL CHECK(revision>=1),
  actor_id TEXT NOT NULL REFERENCES users(id), event TEXT NOT NULL CHECK(event IN ('issue','redeem','renew','revoke')),
  occurred_at TEXT NOT NULL, prior_expires_at TEXT, expires_at TEXT NOT NULL,
  affected_count INTEGER NOT NULL CHECK(affected_count>=0), PRIMARY KEY(invitation_id,revision)
) STRICT;`

const day=86_400_000
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const invalid=()=>new AssetError(422,'INVALID_INVITATION')
const unavailable=()=>new AssetError(404,'INVITATION_UNAVAILABLE')
const conflict=()=>new AssetError(409,'INVITATION_CHANGED')
export type InvitePrincipal=Pick<SessionActor,'userId'|'serviceId'|'personalSpaceId'>
export type InvitationTarget={scope:'object';id:string;permission:'read'|'edit'}|{scope:'project';id:string;permission:'member'}
export type InvitationSpec=InvitationTarget & {days?:number;max_redemptions?:number}
type InvitationRow={id:string;service_id:string;issuer_id:string;object_id:string|null;project_id:string|null;
  permission:'read'|'edit'|'member';issued_at:string;expires_at:string;revoked_at:string|null;max_redemptions:number;redeemed_count:number;revision:number}
type Redemption={id:string;redeemed_at:string;expires_at:string;revoked_at:string|null}
type CanIssue=(a:InvitePrincipal,t:InvitationTarget,now:string)=>{title:string;project_id?:string}|undefined
const target=(r:InvitationRow):InvitationTarget=>r.project_id?{scope:'project',id:r.project_id,permission:'member'}:{scope:'object',id:r.object_id!,permission:r.permission as 'read'|'edit'}

function duration(days=7){if(!Number.isInteger(days)||days<1||days>90)throw invalid();return days*day}
function cap(n=1){if(!Number.isInteger(n)||n<1||n>100)throw invalid();return n}
function receipt(r:InvitationRow){return {id:r.id,target:target(r),issued_at:r.issued_at,expires_at:r.expires_at,revoked_at:r.revoked_at,
  max_redemptions:r.max_redemptions,redeemed_count:r.redeemed_count,revision:r.revision}}
const active=(r:{expires_at:string;revoked_at:string|null},now:string)=>r.revoked_at===null&&now<r.expires_at
function audit(db:DatabaseSync,r:InvitationRow,a:SessionActor,event:string,now:string,before:string|null,count:number){
  db.prepare('INSERT INTO invitation_audit VALUES(?,?,?,?,?,?,?,?)').run(r.id,r.revision,a.userId,event,now,before,r.expires_at,count)
}

export class InvitationStore {
  constructor(private tx:ParseTx,private current:(prior:SessionActor,now:string)=>SessionActor|undefined,
    private principal:(db:DatabaseSync,user:string,service:string)=>InvitePrincipal|undefined,
    private canIssue:CanIssue,private isMember:(a:InvitePrincipal,project:string,now:string)=>boolean){}

  private actor(prior:SessionActor,now:string,expected:string){
    const a=this.current(prior,now);if(!a)throw new AssetError(401,'AUTH_REQUIRED')
    if(a.userId!==expected)throw new AssetError(409,'ACTOR_CHANGED');return a
  }
  private issueTarget(a:InvitePrincipal,t:InvitationTarget,now:string){
    const scope=this.canIssue(a,t,now);if(!scope)throw unavailable();return scope
  }
  private managed(db:DatabaseSync,a:SessionActor,id:string,now:string){
    const r=db.prepare('SELECT * FROM invitations WHERE service_id=? AND id=?').get(a.serviceId,id) as InvitationRow|undefined
    if(!r)throw unavailable();this.issueTarget(a,target(r),now);return r
  }
  private issueSpec(a:SessionActor,s:InvitationSpec,now:string){
    const {scope,id,permission}=s,t={scope,id,permission} as InvitationTarget
    const info=this.issueTarget(a,t,now),expires_at=new Date(Date.parse(now)+duration(s.days)).toISOString()
    return {target:t,title:info.title,expires_at,max_redemptions:cap(s.max_redemptions),server_time:now}
  }
  preview(prior:SessionActor,expected:string,s:InvitationSpec){return this.tx('read',(_db,now)=>{
    return this.issueSpec(this.actor(prior,now,expected),s,now)
  })}
  create(prior:SessionActor,expected:string,s:InvitationSpec,key:string){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now,expected),p=this.issueSpec(a,s,now)
    const req=digest(JSON.stringify([p.target,s.days??7,p.max_redemptions]))
    const old=db.prepare('SELECT * FROM invitations WHERE service_id=? AND issuer_id=? AND request_key=?').get(a.serviceId,a.userId,key) as (InvitationRow&{request_digest:string})|undefined
    if(old){
      if(old.request_digest!==req)throw new AssetError(409,'IDEMPOTENCY_CONFLICT')
      return {...receipt(old),title:p.title,server_time:now,replayed:true}
    }
    const token=randomBytes(32).toString('base64url')
    const r:InvitationRow={id:randomUUID(),service_id:a.serviceId,issuer_id:a.userId,object_id:s.scope==='object'?s.id:null,
      project_id:s.scope==='project'?s.id:null,permission:s.permission,issued_at:now,expires_at:p.expires_at,revoked_at:null,
      max_redemptions:p.max_redemptions,redeemed_count:0,revision:1}
    db.prepare(`INSERT INTO invitations(id,token_hash,service_id,issuer_id,object_id,project_id,permission,issued_at,expires_at,max_redemptions,request_key,request_digest)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id,digest(token),a.serviceId,a.userId,r.object_id,r.project_id,r.permission,now,r.expires_at,r.max_redemptions,key,req)
    audit(db,r,a,'issue',now,null,0)
    return {...receipt(r),title:p.title,token,server_time:now,replayed:false}
  })}
  redeem(prior:SessionActor,expected:string,token:string){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now,expected)
    if(!/^[a-zA-Z0-9_-]{43}$/.test(token))throw unavailable()
    const r=db.prepare('SELECT * FROM invitations WHERE service_id=? AND token_hash=?').get(a.serviceId,digest(token)) as InvitationRow|undefined
    if(!r||!active(r,now))throw unavailable()
    const t=target(r),issuer=this.principal(db,r.issuer_id,a.serviceId)
    if(!issuer||issuer.userId===a.userId)throw unavailable()
    const info=this.issueTarget(issuer,t,now)
    if(t.scope==='object'&&info.project_id&&!this.isMember(a,info.project_id,now))throw unavailable()
    const priorRedemption=db.prepare('SELECT id,redeemed_at,expires_at,revoked_at FROM invitation_redemptions WHERE invitation_id=? AND user_id=?').get(r.id,a.userId) as Redemption|undefined
    if(priorRedemption){
      if(!active(priorRedemption,now))throw unavailable()
      return {id:priorRedemption.id,target:t,title:info.title,expires_at:priorRedemption.expires_at,server_time:now,replayed:true}
    }
    if(r.redeemed_count>=r.max_redemptions)throw new AssetError(409,'INVITATION_FULL')
    const grant=randomUUID()
    db.prepare('INSERT INTO invitation_redemptions VALUES(?,?,?,?,?,NULL)').run(grant,r.id,a.userId,now,r.expires_at)
    const change=db.prepare('UPDATE invitations SET redeemed_count=redeemed_count+1,revision=revision+1 WHERE id=? AND revision=? AND redeemed_count<max_redemptions').run(r.id,r.revision)
    if(change.changes!==1)throw conflict()
    audit(db,{...r,revision:r.revision+1},a,'redeem',now,null,1)
    return {id:grant,target:t,title:info.title,expires_at:r.expires_at,server_time:now,replayed:false}
  })}
  get(prior:SessionActor,expected:string,id:string){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now,expected),r=this.managed(db,a,id,now)
    const rows=db.prepare('SELECT id,user_id,expires_at FROM invitation_redemptions WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY id').all(id,now)
    return {...receipt(r),active:active(r,now),affected:rows,server_time:now}
  })}
  list(prior:SessionActor){return this.tx('read',(db,now)=>{
    const a=this.actor(prior,now,prior.userId)
    const rows=db.prepare('SELECT * FROM invitations WHERE service_id=? AND issuer_id=? ORDER BY issued_at DESC,id DESC LIMIT 100').all(a.serviceId,a.userId) as InvitationRow[]
    const items=rows.flatMap(r=>{const scope=this.canIssue(a,target(r),now);return scope?[{...receipt(r),title:scope.title,active:active(r,now)}]:[]})
    return {actor_id:a.userId,server_time:now,items}
  })}
  change(prior:SessionActor,expected:string,id:string,expectedRevision:number,event:'renew'|'revoke',days?:number){return this.tx('write',(db,now)=>{
    const a=this.actor(prior,now,expected),r=this.managed(db,a,id,now)
    if(!active(r,now))throw unavailable()
    if(expectedRevision!==r.revision)throw conflict()
    const expires_at=event==='renew'?new Date(Date.parse(r.expires_at)+duration(days)).toISOString():r.expires_at
    // Existing direct permissions and previously revoked redemptions never join this transaction.
    const changed=event==='renew'?
      db.prepare('UPDATE invitation_redemptions SET expires_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>?').run(expires_at,id,now):
      db.prepare('UPDATE invitation_redemptions SET revoked_at=? WHERE invitation_id=? AND revoked_at IS NULL AND expires_at>?').run(now,id,now)
    const next={...r,expires_at,revoked_at:event==='revoke'?now:null,revision:r.revision+1}
    db.prepare('UPDATE invitations SET expires_at=?,revoked_at=?,revision=? WHERE id=?').run(expires_at,next.revoked_at,next.revision,id)
    audit(db,next,a,event,now,r.expires_at,Number(changed.changes))
    return {...receipt(next),affected_count:Number(changed.changes),server_time:now}
  })}
}
