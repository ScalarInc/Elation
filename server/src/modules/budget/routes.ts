import {
  addBudgetLineBody,
  applyToBudgetResponse,
  budgetNoteBody,
  budgetPlanSchema,
  budgetSummarySchema,
  createBudgetBody,
  eventBudgetResponse,
  putBudgetBody,
  quoteSchema,
  seededBudgetResponse,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as budget from './service'

const params = z.object({ id: z.string() })

/** Budget estimator (docs/step-08-budget.md). */
export const budgetRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)
  const deps = { db: app.prisma, mailer: app.mailer, appUrl: app.config.APP_URL, log: app.log }
  // Hand-offs email the consultant — keep a stuck button from flooding them.
  const handOffLimit = rateLimit({ name: 'budget-handoff', max: 20, windowMs: 60 * 60 * 1000, key: (r) => currentUser(r).id })

  app.get('/budgets', { schema: { response: { 200: z.array(budgetSummarySchema) } } }, async (request) =>
    budget.listBudgets(app.prisma, currentUser(request)),
  )

  app.get('/events/:id/budget', { schema: { params, response: { 200: eventBudgetResponse } } }, async (request) =>
    budget.getEventBudget(app.prisma, currentUser(request), request.params.id),
  )

  app.post(
    '/events/:id/budget',
    { schema: { params, body: createBudgetBody, response: { 201: seededBudgetResponse } } },
    async (request, reply) => reply.code(201).send(await budget.createBudget(app.prisma, currentUser(request), request.params.id, request.body)),
  )

  app.put('/events/:id/budget', { schema: { params, body: putBudgetBody, response: { 200: budgetPlanSchema } } }, async (request) =>
    budget.putBudget(app.prisma, currentUser(request), request.params.id, request.body),
  )

  app.post(
    '/events/:id/budget/lines',
    { schema: { params, body: addBudgetLineBody, response: { 200: budgetPlanSchema } } },
    async (request) => budget.addBudgetLine(app.prisma, currentUser(request), request.params.id, request.body),
  )

  app.post('/events/:id/budget/reset', { schema: { params, response: { 200: budgetPlanSchema } } }, async (request) =>
    budget.resetBudget(app.prisma, currentUser(request), request.params.id),
  )

  app.post('/events/:id/budget/reprice', { schema: { params, response: { 200: budgetPlanSchema } } }, async (request) =>
    budget.repriceBudget(app.prisma, currentUser(request), request.params.id),
  )

  app.post(
    '/events/:id/budget/send-to-consultant',
    {
      schema: { params, body: budgetNoteBody, response: { 200: z.object({ plan: budgetPlanSchema, consultantName: z.string().nullable() }) } },
      preHandler: [handOffLimit],
    },
    async (request) => budget.sendToConsultant(deps, currentUser(request), request.params.id, request.body.note),
  )

  app.post(
    '/events/:id/budget/quote',
    { schema: { params, body: budgetNoteBody, response: { 200: quoteSchema, 201: quoteSchema } }, preHandler: [handOffLimit] },
    async (request, reply) => {
      const { quote, created } = await budget.requestQuote(deps, currentUser(request), request.params.id, request.body.note)
      return reply.code(created ? 201 : 200).send(quote)
    },
  )

  app.get('/events/:id/budget/quotes', { schema: { params, response: { 200: z.array(quoteSchema) } } }, async (request) =>
    budget.listQuotes(app.prisma, currentUser(request), request.params.id),
  )

  app.post(
    '/moodboards/:id/apply-to-budget',
    { schema: { params, response: { 200: applyToBudgetResponse } } },
    async (request) => budget.applyMoodboardToBudget(app.prisma, currentUser(request), request.params.id),
  )
}
