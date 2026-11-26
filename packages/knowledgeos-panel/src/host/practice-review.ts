import type { GradingState } from './practice-policy.ts'

export const PRACTICE_REVIEW_SCHEMA = `
CREATE TABLE practice_hint_events (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL, question_version_id TEXT NOT NULL,
  level INTEGER NOT NULL CHECK(level IN (1,2)), request_key TEXT NOT NULL, requested_at TEXT NOT NULL,
  FOREIGN KEY(session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  FOREIGN KEY(session_id,question_version_id) REFERENCES practice_session_questions(session_id,question_version_id),
  UNIQUE(service_id,user_id,request_key), UNIQUE(session_id,question_version_id,level)
) STRICT;
CREATE TABLE practice_disputes (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, user_id TEXT NOT NULL, attempt_id TEXT NOT NULL,
  question_version_id TEXT NOT NULL REFERENCES question_versions(id), reason TEXT NOT NULL,
  request_key TEXT NOT NULL, opened_at TEXT NOT NULL,
  FOREIGN KEY(attempt_id,service_id,user_id) REFERENCES practice_attempts(id,service_id,user_id),
  UNIQUE(service_id,user_id,request_key), UNIQUE(service_id,user_id,question_version_id)
) STRICT;
CREATE INDEX practice_dispute_version ON practice_disputes(question_version_id);
CREATE TABLE question_corrections (
  id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES questions(id), from_version_id TEXT NOT NULL, to_version_id TEXT UNIQUE NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, request_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK(length(request_digest)=64), created_at TEXT NOT NULL,
  FOREIGN KEY(question_id,from_version_id) REFERENCES question_versions(question_id,id),
  FOREIGN KEY(question_id,to_version_id) REFERENCES question_versions(question_id,id),
  UNIQUE(question_id,from_version_id), UNIQUE(author_id,request_key)
) STRICT;
CREATE TABLE practice_attempt_regrades (
  attempt_id TEXT NOT NULL REFERENCES practice_attempts(id), corrected_version_id TEXT NOT NULL REFERENCES question_versions(id),
  correction_id TEXT NOT NULL REFERENCES question_corrections(id), grading_state TEXT NOT NULL CHECK(grading_state IN ('correct','incorrect','disputed')),
  evaluated_at TEXT NOT NULL, PRIMARY KEY(attempt_id,corrected_version_id)
) STRICT;
CREATE TABLE personal_question_states (
  service_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), question_id TEXT NOT NULL REFERENCES questions(id),
  revision INTEGER NOT NULL CHECK(revision>=1), wrong_reason TEXT NOT NULL,
  mastery_state TEXT NOT NULL CHECK(mastery_state IN ('new','reviewing','mastered')), next_review_at TEXT,
  updated_at TEXT NOT NULL, PRIMARY KEY(service_id,user_id,question_id)
) STRICT;
CREATE TABLE personal_question_receipts (
  service_id TEXT NOT NULL, user_id TEXT NOT NULL, request_key TEXT NOT NULL,
  question_id TEXT NOT NULL, digest TEXT NOT NULL CHECK(length(digest)=64), result_json TEXT NOT NULL,
  FOREIGN KEY(service_id,user_id,question_id) REFERENCES personal_question_states(service_id,user_id,question_id),
  PRIMARY KEY(service_id,user_id,request_key)
) STRICT;
`

export type Mastery = 'new'|'reviewing'|'mastered'
export interface ReviewDraft {
  expected_revision:number;wrong_reason?:string;mastery_state?:Mastery;next_review_at?:string|null
}
export interface PersonalState {
  revision:number;wrong_reason:string;mastery_state:Mastery;next_review_at:string|null;updated_at:string|null
}
export type Classification = 'wrong'|'uncertain'|'assisted'|'disputed'|'independent_correct'

export function classifyPractice(grade:GradingState|null, paused:boolean, independent:boolean, confident:boolean):Classification {
  if(paused||grade===null||grade==='disputed')return 'disputed'
  if(grade==='incorrect')return 'wrong'
  if(!independent)return 'assisted'
  return confident?'independent_correct':'uncertain'
}

export const hintText = {
  1:'先找出题干中的对象、限制和需要判断的条件。',
  2:'逐一核对你的候选答案是否满足所有限制。写下每项能成立或应排除的理由。',
}
