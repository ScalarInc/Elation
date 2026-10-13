import { z } from 'zod'

/** Questionnaire contracts (docs/step-05-questionnaire.md). */

export const categoryProgressSchema = z.object({
  slug: z.string(),
  title: z.string(),
  order: z.number().int(),
  visibleCount: z.number().int(),
  answeredCount: z.number().int(),
  percent: z.number().int(),
  isComplete: z.boolean(),
  isStarted: z.boolean(),
})

export const questionnaireSchema = z.object({
  eventId: z.string(),
  schemaVersion: z.number().int(),
  answers: z.record(z.string(), z.unknown()),
  elationDecides: z.record(z.string(), z.boolean()),
  percentComplete: z.number().int(),
  categories: z.array(categoryProgressSchema),
  submittedAt: z.string().nullable(),
  /** Optimistic-concurrency token; send it back with every PATCH. 0 = nothing saved yet. */
  version: z.number().int(),
  updatedAt: z.string().nullable(),
})
export type QuestionnaireDto = z.infer<typeof questionnaireSchema>

export const patchQuestionnaireBody = z
  .object({
    version: z.number().int().min(0),
    /** qid → new answer. */
    set: z.record(z.string(), z.unknown()).optional(),
    /** qid → hand this question to Elation (true) or take it back (false). */
    decides: z.record(z.string(), z.boolean()).optional(),
    /** qids to clear. */
    clear: z.array(z.string()).max(200).optional(),
  })
  .refine((b) => b.set || b.decides || b.clear, 'Nothing to save')
export type PatchQuestionnaireBody = z.infer<typeof patchQuestionnaireBody>

export const briefSchema = z.object({
  eventId: z.string(),
  submittedAt: z.string().nullable(),
  categories: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      items: z.array(
        z.object({
          qid: z.string(),
          label: z.string(),
          /** Human-readable answer; null when Elation decides. */
          answer: z.string().nullable(),
          elationDecides: z.boolean(),
        }),
      ),
    }),
  ),
})
export type QuestionnaireBrief = z.infer<typeof briefSchema>

export const revisionSchema = z.object({
  id: z.string(),
  actor: z.object({ id: z.string(), name: z.string(), role: z.string() }).nullable(),
  changes: z.array(z.object({ qid: z.string(), from: z.unknown(), to: z.unknown(), decides: z.boolean().optional() })),
  createdAt: z.string(),
})
export type QuestionnaireRevisionDto = z.infer<typeof revisionSchema>
