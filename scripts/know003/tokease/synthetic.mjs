export const fixture = {
  from: { title: '限次重试与降级方案', kind: 'solution', definition: '采样中断时限次重试，达到上限后降级，以恢复间歇性采样。' },
  to: { title: '间歇性采样中断案例', kind: 'case', definition: '监测系统遇到间歇性采样中断，需要恢复采样并避免无界重试。' },
  evidence: ['降级并限次重试可以帮助恢复间歇性采样中断。证据 K-003-ALPHA'],
  allowed_types: ['solves'],
}
