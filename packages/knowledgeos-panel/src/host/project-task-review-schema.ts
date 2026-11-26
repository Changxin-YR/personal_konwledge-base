export const PROJECT_TASK_REVIEW_SCHEMA = `
CREATE TABLE task_submissions (
  id TEXT NOT NULL UNIQUE, task_id TEXT NOT NULL REFERENCES tasks(id),
  version INTEGER NOT NULL CHECK(version>0), criteria_version INTEGER NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id), content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 16000),
  submitted_at TEXT NOT NULL, previous_version INTEGER,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  PRIMARY KEY(task_id,version), UNIQUE(task_id,author_id,request_key),
  FOREIGN KEY(task_id,criteria_version) REFERENCES task_criteria_versions(task_id,version),
  FOREIGN KEY(task_id,previous_version) REFERENCES task_submissions(task_id,version),
  CHECK((version=1 AND previous_version IS NULL) OR (version>1 AND previous_version IS NOT NULL AND previous_version=version-1))
) STRICT;
CREATE TABLE task_review_decisions (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id), stage TEXT NOT NULL CHECK(stage IN ('peer','final')),
  verdict TEXT NOT NULL, criteria_results TEXT NOT NULL CHECK(json_valid(criteria_results) AND json_type(criteria_results)='array'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000), requested_work TEXT,
  decided_at TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(submission_id,stage), UNIQUE(submission_id,reviewer_id,request_key),
  CHECK((stage='peer' AND verdict IN ('pass','return')) OR (stage='final' AND verdict IN ('accept','return','fail'))),
  CHECK((verdict='return' AND requested_work IS NOT NULL AND length(requested_work) BETWEEN 1 AND 4000)
    OR (verdict!='return' AND requested_work IS NULL))
) STRICT;
`

export const PROJECT_TASK_CORRECTION_SCHEMA = `
CREATE TABLE task_review_corrections (
  id TEXT PRIMARY KEY, submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES users(id),
  previous_review_id TEXT UNIQUE REFERENCES task_review_decisions(id),
  previous_correction_id TEXT UNIQUE REFERENCES task_review_corrections(id),
  verdict TEXT NOT NULL CHECK(verdict IN ('accept','return','fail')),
  criteria_results TEXT NOT NULL CHECK(json_valid(criteria_results) AND json_type(criteria_results)='array'),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000), requested_work TEXT,
  decided_at TEXT NOT NULL, request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(submission_id,reviewer_id,request_key),
  CHECK((previous_review_id IS NULL) != (previous_correction_id IS NULL)),
  CHECK((verdict='return' AND requested_work IS NOT NULL AND length(requested_work) BETWEEN 1 AND 4000)
    OR (verdict!='return' AND requested_work IS NULL))
) STRICT;
CREATE INDEX task_review_corrections_submission ON task_review_corrections(submission_id);
`
