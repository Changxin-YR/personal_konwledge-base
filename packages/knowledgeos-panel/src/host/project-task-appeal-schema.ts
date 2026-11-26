export const PROJECT_TASK_APPEAL_SCHEMA = `
CREATE TABLE task_appeals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), submission_id TEXT NOT NULL REFERENCES task_submissions(id),
  requester_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 4000),
  against_review_id TEXT UNIQUE REFERENCES task_review_decisions(id),
  against_correction_id TEXT UNIQUE REFERENCES task_review_corrections(id),
  status TEXT NOT NULL CHECK(status IN ('pending','resolved')), requested_at TEXT NOT NULL,
  resolved_by TEXT REFERENCES users(id), resolution_decision_id TEXT UNIQUE REFERENCES task_review_corrections(id), resolved_at TEXT,
  request_key TEXT NOT NULL, request_digest TEXT NOT NULL CHECK(length(request_digest)=64),
  UNIQUE(task_id,requester_id,request_key),
  CHECK((against_review_id IS NULL) != (against_correction_id IS NULL)),
  CHECK((status='pending' AND resolved_by IS NULL AND resolution_decision_id IS NULL AND resolved_at IS NULL)
    OR (status='resolved' AND resolved_by IS NOT NULL AND resolution_decision_id IS NOT NULL AND resolved_at IS NOT NULL))
) STRICT;
CREATE INDEX task_appeals_history ON task_appeals(task_id,requested_at);
CREATE UNIQUE INDEX task_appeals_pending ON task_appeals(task_id) WHERE status='pending';
CREATE TABLE task_decision_impacts (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id), task_revision INTEGER NOT NULL CHECK(task_revision>0),
  recalculation_required INTEGER NOT NULL CHECK(recalculation_required IN (0,1)), updated_at TEXT NOT NULL
) STRICT;
`
