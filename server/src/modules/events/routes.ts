import { createEventBody, eventSchema, listEventsQuery, updateEventBody } from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../../plugins/auth'
import * as events from './service'

const params = z.object({ id: z.string() })

/** Events (docs/step-04-events.md). Scoped by role through lib/policy.ts. */
export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.requireAuth)

  app.get(
    '/events',
    { schema: { querystring: listEventsQuery, response: { 200: z.array(eventSchema) } } },
    async (request) => events.listEvents(app.prisma, currentUser(request), request.query),
  )

  app.post('/events', { schema: { body: createEventBody, response: { 201: eventSchema } } }, async (request, reply) => {
    const created = await events.createEvent(app.prisma, currentUser(request), request.body)
    return reply.code(201).send(created)
  })

  app.get('/events/:id', { schema: { params, response: { 200: eventSchema } } }, async (request) =>
    events.getEvent(app.prisma, currentUser(request), request.params.id),
  )

  app.patch(
    '/events/:id',
    { schema: { params, body: updateEventBody, response: { 200: eventSchema } } },
    async (request) => events.updateEvent(app.prisma, currentUser(request), request.params.id, request.body),
  )

  app.post(
    '/events/:id/duplicate',
    { schema: { params, response: { 201: eventSchema } } },
    async (request, reply) => {
      const copy = await events.duplicateEvent(app.prisma, currentUser(request), request.params.id)
      return reply.code(201).send(copy)
    },
  )

  app.post('/events/:id/archive', { schema: { params, response: { 200: eventSchema } } }, async (request) =>
    events.setArchived(app.prisma, currentUser(request), request.params.id, true),
  )

  app.post('/events/:id/unarchive', { schema: { params, response: { 200: eventSchema } } }, async (request) =>
    events.setArchived(app.prisma, currentUser(request), request.params.id, false),
  )

  app.delete('/events/:id', { schema: { params } }, async (request, reply) => {
    await events.deleteEvent(app.prisma, currentUser(request), request.params.id)
    return reply.code(204).send()
  })
}
