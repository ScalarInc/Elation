import { categories, questions, questionsInCategory, visibleQuestions } from './schema'
import type { Answers } from './types'

/** True if the answer is meaningful (non-empty string, non-empty array, defined number). */
export function isAnswered(value: unknown): boolean {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value as object).some((v) => v != null && v !== '')
  return true
}

export type CategoryProgress = {
  slug: string
  title: string
  order: number
  visibleCount: number
  answeredCount: number
  percent: number
  isComplete: boolean
  isStarted: boolean
}

export function computeCategoryProgress(
  answers: Answers,
  decides: Record<string, boolean>,
): CategoryProgress[] {
  const visible = visibleQuestions(questions, answers)
  return categories.map((c) => {
    const catQs = visible.filter((q) => q.category === c.title)
    // Fallback for categories where every question is conditional & hidden.
    const total = catQs.length || questionsInCategory(c.title).length
    const answered = catQs.filter(
      (q) => isAnswered(answers[q.id]) || decides[q.id],
    ).length
    const percent = total === 0 ? 0 : Math.round((answered / total) * 100)
    return {
      slug: c.slug,
      title: c.title,
      order: c.order,
      visibleCount: total,
      answeredCount: answered,
      percent,
      isComplete: total > 0 && answered === total,
      isStarted: answered > 0,
    }
  })
}

export function computeOverallPercent(progress: CategoryProgress[]): number {
  const totals = progress.reduce(
    (acc, c) => ({
      answered: acc.answered + c.answeredCount,
      total: acc.total + c.visibleCount,
    }),
    { answered: 0, total: 0 },
  )
  return totals.total === 0 ? 0 : Math.round((totals.answered / totals.total) * 100)
}
