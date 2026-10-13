import { z } from 'zod'
import { isAnswered } from './progress'
import { questionById, questions, visibleQuestions, type Question } from './schema'
import type { Answers } from './types'

/**
 * Answer validation shared by the server (authoritative) and the webapp.
 * One zod schema per question kind; options are enforced for chip questions.
 */

const shortText = z.string().max(300)
const longText = z.string().max(4000)
const feet = z.number().min(0).max(100_000)

export function answerSchemaFor(q: Question): z.ZodType {
  switch (q.kind) {
    case 'single':
    case 'range-select':
      return z.enum(q.options as [string, ...string[]])
    case 'multi':
      return z.array(z.enum(q.options as [string, ...string[]])).max(q.options!.length)
    case 'text':
      return shortText
    case 'textarea':
      return longText
    case 'number':
      return z.number().int().min(0).max(1_000_000)
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    case 'dimensions':
      return z.object({ w: feet.optional(), d: feet.optional(), h: feet.optional() }).strict()
    case 'color':
      return z
        .object({
          desc: longText.optional(),
          hex: z.array(z.string().regex(/^#[0-9a-f]{6}$/i, 'Use #RRGGBB')).max(12).optional(),
        })
        .strict()
    case 'upload':
      // File references (names today, File ids once uploads land in Step 11).
      return z.array(z.string().min(1).max(300)).max(30)
  }
}

export type AnswerIssue = { qid: string; message: string }

/** Validate a batch of answers; unknown ids and bad values are reported per question. */
export function validateAnswers(set: Record<string, unknown>): AnswerIssue[] {
  const issues: AnswerIssue[] = []
  for (const [qid, value] of Object.entries(set)) {
    const q = questionById.get(qid)
    if (!q) {
      issues.push({ qid, message: 'Unknown question' })
      continue
    }
    const result = answerSchemaFor(q).safeParse(value)
    if (!result.success) issues.push({ qid, message: result.error.issues[0]?.message ?? 'Invalid answer' })
  }
  return issues
}

/**
 * Only the answers to questions currently visible under the branching rules.
 * Hidden answers are kept in storage (switching a gate back restores them) but
 * every consumer — progress, brief, curation, analytics — reads through this.
 */
export function visibleAnswers(answers: Answers): Answers {
  const out: Answers = {}
  for (const q of visibleQuestions(questions, answers)) {
    if (answers[q.id] !== undefined) out[q.id] = answers[q.id]
  }
  return out
}

/** Required + visible questions that are neither answered nor handed to Elation. */
export function missingRequired(answers: Answers, decides: Record<string, boolean>): string[] {
  return visibleQuestions(questions, answers)
    .filter((q) => q.required && !isAnswered(answers[q.id]) && !decides[q.id])
    .map((q) => q.id)
}
