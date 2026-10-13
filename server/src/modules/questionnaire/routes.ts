import { briefSchema, patchQuestionnaireBody, questionnaireSchema, revisionSchema } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../plugins/auth'
import { generateFirstConcepts } from '../moodboards/service'
import * as questionnaire from './service'

const params = z.object({ id: z.string() })

/** Questionnaire per event (docs/step-05-questionnaire.md). */
export const questionnaireRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/events/:id/questionnaire',
    { schema: { params, response: { 200: questionnaireSchema } } },
    async (request) => questionnaire.getQuestionnaire(app.prisma, currentUser(request), request.params.id),
  )

  app.patch(
    '/events/:id/questionnaire',
    { schema: { params, body: patchQuestionnaireBody, response: { 200: questionnaireSchema } } },
    async (request) =>
      questionnaire.patchQuestionnaire(app.prisma, currentUser(request), request.params.id, request.body),
  )

  app.post(
    '/events/:id/questionnaire/submit',
    { schema: { params, response: { 200: questionnaireSchema } } },
    async (request) => {
      const actor = currentUser(request)
      const submitted = await questionnaire.submitQuestionnaire(app.prisma, actor, request.params.id)
      // First concepts from the answers (decision P14) — the submit has committed; a curation failure is only logged.
      await generateFirstConcepts(app.prisma, actor, request.params.id).catch((err: unknown) =>
        request.log.warn({ err }, 'first moodboard concepts failed'),
      )
      return submitted
    },
  )

  app.post(
    '/events/:id/questionnaire/reopen',
    { schema: { params, response: { 200: questionnaireSchema } } },
    async (request) => questionnaire.reopenQuestionnaire(app.prisma, currentUser(request), request.params.id),
  )

  app.get(
    '/events/:id/questionnaire/brief',
    { schema: { params, response: { 200: briefSchema } } },
    async (request) => questionnaire.getBrief(app.prisma, currentUser(request), request.params.id),
  )

  app.get(
    '/events/:id/questionnaire/revisions',
    {
      schema: {
        params,
        querystring: z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }),
        response: { 200: z.object({ items: z.array(revisionSchema), nextCursor: z.string().nullable() }) },
      },
    },
    async (request) =>
      questionnaire.listRevisions(app.prisma, currentUser(request), request.params.id, request.query),
  )
}
