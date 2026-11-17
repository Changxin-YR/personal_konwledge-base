import { readFile, writeFile } from 'node:fs/promises'
const path = 'config/work_units.json'
const catalog = JSON.parse(await readFile(path, 'utf8'))
const unit = catalog.units.find(item => item.id === 'FND-004')
unit.test_result_status = 'PASS'
unit.independent_review_status = 'PASS'
unit.retest_status = 'PASS'
unit.status = 'passed'
unit.test_plan_status = 'detailed_completed'
unit.completed_at = '2026-11-17T23:27:29+08:00'
unit.completed_test_ids = unit.test_obligations.map(item => item.id)
unit.evidence_paths = ['docs/evidence/FND-004/architecture.md', 'docs/evidence/FND-004/permission-matrix.md', 'docs/evidence/FND-004/test-plan.md', 'docs/evidence/FND-004/REPORT.md', 'docs/evidence/FND-004/candidate.md', 'docs/evidence/FND-004/runs/fnd004-final-20261117/summary.json', 'docs/evidence/FND-004/independent/summary.json']
unit.completion_gate = 'FND-004-T01至T07在冻结候选实际通过；独立复核通过；完整A02/A34/A46未覆盖范围保持NOT_RUN；提交推送后停在FND-004等待用户。'
catalog.updated_at = '2026-11-17'
await writeFile(path, JSON.stringify(catalog, null, 2) + '\n')
