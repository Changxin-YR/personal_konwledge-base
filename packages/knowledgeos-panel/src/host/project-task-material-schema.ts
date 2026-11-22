export const PROJECT_TASK_MATERIAL_SCHEMA = `
CREATE TABLE task_submission_materials (
  task_id TEXT NOT NULL, submission_version INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 10),
  asset_id TEXT NOT NULL REFERENCES assets(id), version_id TEXT NOT NULL REFERENCES asset_versions(id),
  ordinal INTEGER NOT NULL CHECK(ordinal>=1), conversion_id TEXT REFERENCES office_conversions(id),
  PRIMARY KEY(task_id,submission_version,position),
  FOREIGN KEY(task_id,submission_version) REFERENCES task_submissions(task_id,version)
) STRICT;
CREATE TABLE task_material_waits (
  task_id TEXT PRIMARY KEY, submission_version INTEGER NOT NULL,
  resume_state TEXT NOT NULL CHECK(resume_state IN ('submitted','awaiting_admin_review')),
  FOREIGN KEY(task_id,submission_version) REFERENCES task_submissions(task_id,version)
) STRICT;
`
