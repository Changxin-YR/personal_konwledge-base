// UI-001 independent expectations derived from P01 / T01 / T02 at af2a444.
// 两个工作区各经一次直接激活进入相同学习工具。在各自的真实列表选中同一对象。
// 甲从知识库提交遮挡和错题状态，从今日计划读回并再次修改，再从知识库核对。
// 乙能读共同资料和共用题版，个人卡、遮挡记录、错题原因和进度各归本人。
// 宽窄屏均用真实 Tab 遍历和 Enter 激活。记录可见位置、焦点、导航层级及页面宽度。
// SQLite 和只读业务 API 提供独立对照。Host 使用隔离合成资料，模型调用计数为零。
export const homes = Object.freeze(['/knowledgeos/library', '/knowledgeos/today'])
export const shortcuts = Object.freeze([
  { key: 'terms', name: '专业术语', path: '/knowledgeos/terms' },
  { key: 'recall', name: '遮挡背诵', path: '/knowledgeos/recall' },
  { key: 'quick', name: '基础快答', path: '/knowledgeos/practice?track=quick' },
  { key: 'review', name: '错题复习', path: '/knowledgeos/review' },
])
export const sizes = Object.freeze({ wide: { width: 1280, height: 900 }, narrow: { width: 390, height: 844 } })
