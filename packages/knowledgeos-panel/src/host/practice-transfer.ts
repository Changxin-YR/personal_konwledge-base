export const PRACTICE_TRANSFER_SCHEMA = `
ALTER TABLE question_versions ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'basic' CHECK(difficulty IN ('basic','intermediate','advanced'));
ALTER TABLE practice_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'standard' CHECK(mode IN ('standard','guided','transfer'));
ALTER TABLE practice_hint_events ADD COLUMN for_sequence INTEGER NOT NULL DEFAULT 1 CHECK(for_sequence>=1);
CREATE TABLE practice_solution_reveals (
  service_id TEXT NOT NULL, user_id TEXT NOT NULL, session_id TEXT NOT NULL, question_version_id TEXT NOT NULL,
  after_sequence INTEGER NOT NULL CHECK(after_sequence>=1), request_key TEXT NOT NULL, revealed_at TEXT NOT NULL,
  FOREIGN KEY(session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  FOREIGN KEY(session_id,question_version_id) REFERENCES practice_session_questions(session_id,question_version_id),
  PRIMARY KEY(session_id,question_version_id), UNIQUE(service_id,user_id,request_key)
) STRICT;
CREATE TABLE practice_transfers (
  id TEXT PRIMARY KEY, service_id TEXT NOT NULL, user_id TEXT NOT NULL,
  source_session_id TEXT NOT NULL, source_version_id TEXT NOT NULL, first_attempt_id TEXT NOT NULL, guided_attempt_id TEXT NOT NULL,
  target_version_id TEXT NOT NULL REFERENCES question_versions(id), available_at TEXT NOT NULL, created_at TEXT NOT NULL,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  started_session_id TEXT UNIQUE, start_key TEXT, started_at TEXT,
  FOREIGN KEY(source_session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  FOREIGN KEY(source_session_id,source_version_id) REFERENCES practice_session_questions(session_id,question_version_id),
  FOREIGN KEY(first_attempt_id,service_id,user_id) REFERENCES practice_attempts(id,service_id,user_id),
  FOREIGN KEY(guided_attempt_id,service_id,user_id) REFERENCES practice_attempts(id,service_id,user_id),
  FOREIGN KEY(started_session_id,service_id,user_id) REFERENCES practice_sessions(id,service_id,user_id),
  CHECK(first_attempt_id<>guided_attempt_id AND source_version_id<>target_version_id),
  CHECK((started_session_id IS NULL)=(started_at IS NULL) AND (started_session_id IS NULL)=(start_key IS NULL)),
  UNIQUE(service_id,user_id,request_key), UNIQUE(service_id,user_id,start_key),
  UNIQUE(source_session_id,target_version_id)
) STRICT;
CREATE INDEX practice_transfers_owner ON practice_transfers(service_id,user_id,available_at,id);
`

export const difficultyBands=['basic','intermediate','advanced'] as const
export type Difficulty=typeof difficultyBands[number]
export type PracticeMode='standard'|'guided'|'transfer'
export interface TransferDraft {
  primary_session_id:string;target_version_id:string;available_at:string
}
