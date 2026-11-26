export const questionKinds = ['choice', 'judgment', 'fill'] as const
export type QuestionKind = typeof questionKinds[number]
export type Answer = string | boolean | number
export type Confidence = 'sure' | 'unsure'
export type GradingState = 'correct' | 'incorrect' | 'disputed'

export const fillRule = 'nfkc-space-case-v1'
export const exactRule = 'exact-v1'

export function normalizeFill(answer: string) {
  return answer.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function scoreAnswer(kind: QuestionKind, answer: Answer, accepted: Answer[]): GradingState {
  if (kind === 'fill') {
    return typeof answer === 'string' && accepted.some(value => normalizeFill(String(value)) === normalizeFill(answer))
      ? 'correct' : 'disputed'
  }
  return answer === accepted[0] ? 'correct' : 'incorrect'
}
