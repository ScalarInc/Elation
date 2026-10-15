import {
  ANALYTICS_REPORTS,
  adminArSetSchema,
  adminClientDetailSchema,
  adminInspirationSchema,
  adminQuoteSchema,
  analyticsQuery,
  analyticsSchema,
  arAssetWriteBody,
  arSetWriteBody,
  arStatusBody,
  auditEntrySchema,
  bulkClientsBody,
  bulkResultSchema,
  clientPageSchema,
  convertInquiryBody,
  createNoteBody,
  extendBody,
  followUpsQuery,
  inquirySchema,
  inspirationWriteBody,
  inviteClientBody,
  inviteClientResponse,
  inviteStaffBody,
  listClientsQuery,
  listInquiriesQuery,
  listQuotesQuery,
  noteSchema,
  overviewSchema,
  publicInquiryBody,
  revokeBody,
  settingsSchema,
  teamMemberSchema,
  updateClientBody,
  updateInquiryBody,
  updateNoteBody,
  updateQuoteBody,
  updateSettingsBody,
  updateStaffBody,
} from '@elation/shared/api'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { byIp, rateLimit } from '../../lib/rate-limit'
import { currentUser } from '../../plugins/auth'
import * as an from './analytics'
import { auditFor } from './audit'
import * as clients from './clients'
import * as cms from './cms'
import * as inquiries from './inquiries'
import { inviteClient, inviteStaff, resendInvite } from './invites'
import * as notes from './notes'
import * as quotes from './quotes'
import { getSettings, updateSettings } from './settings'
import * as team from './team'

const id = z.object({ id: z.string().max(64) })
const assetParams = z.object({ id: z.string().max(64), assetId: z.string().max(64) })

/** Staff-only API (docs/step-12-admin.md). Consultants are scoped to their own clients throughout. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  // onRequest, not preHandler: reject callers before body validation runs.
  app.addHook('onRequest', app.requireRole('CONSULTANT', 'ADMIN'))
  const deps = { db: app.prisma, config: app.config, mailer: app.mailer, realtime: app.realtime, log: app.log }
  const meta = (r: { ip: string }) => ({ ip: r.ip })
  const adminOnly = { onRequest: app.requireRole('ADMIN') }

  // ─── Clients ───
  app.get('/admin/clients', { schema: { querystring: listClientsQuery, response: { 200: clientPageSchema } } }, async (r) =>
    clients.listClients(app.prisma, currentUser(r), r.query),
  )
  app.post('/admin/clients/invite', { schema: { body: inviteClientBody, response: { 201: inviteClientResponse } } }, async (r, reply) =>
    reply.code(201).send(await inviteClient(deps, currentUser(r), r.body, meta(r))),
  )
  app.get('/admin/clients/:id', { schema: { params: id, response: { 200: adminClientDetailSchema } } }, async (r) =>
    clients.getClientDetail(app.prisma, currentUser(r), r.params.id, app.config.EXPIRED_DATA_RETENTION_DAYS),
  )
  app.patch('/admin/clients/:id', { schema: { params: id, body: updateClientBody, response: { 200: adminClientDetailSchema } } }, async (r) =>
    clients.updateClient(deps, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.post('/admin/clients/:id/resend-invite', { schema: { params: id, response: { 200: inviteClientResponse } } }, async (r) => {
    await clients.getClientDetail(app.prisma, currentUser(r), r.params.id, app.config.EXPIRED_DATA_RETENTION_DAYS) // access check
    return resendInvite(deps, currentUser(r), r.params.id, meta(r))
  })
  app.post('/admin/clients/:id/extend', { schema: { params: id, body: extendBody, response: { 200: adminClientDetailSchema } } }, async (r) =>
    clients.extendAccess(deps, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.post('/admin/clients/:id/revoke', { schema: { params: id, body: revokeBody, response: { 200: adminClientDetailSchema } } }, async (r) =>
    clients.revokeClient(deps, currentUser(r), r.params.id, r.body.reason, meta(r)),
  )
  app.post('/admin/clients/:id/restore', { schema: { params: id, response: { 200: adminClientDetailSchema } } }, async (r) =>
    clients.restoreClient(deps, currentUser(r), r.params.id, meta(r)),
  )
  app.post('/admin/clients/bulk', { schema: { body: bulkClientsBody, response: { 200: bulkResultSchema } } }, async (r) =>
    clients.bulkClients(deps, currentUser(r), r.body, meta(r)),
  )

  // ─── Notes & follow-ups ───
  app.get('/admin/clients/:id/notes', { schema: { params: id, response: { 200: z.array(noteSchema) } } }, async (r) =>
    notes.listNotes(app.prisma, currentUser(r), r.params.id),
  )
  app.post('/admin/clients/:id/notes', { schema: { params: id, body: createNoteBody, response: { 201: noteSchema } } }, async (r, reply) =>
    reply.code(201).send(await notes.createNote(app.prisma, currentUser(r), r.params.id, r.body, meta(r))),
  )
  app.patch('/admin/notes/:id', { schema: { params: id, body: updateNoteBody, response: { 200: noteSchema } } }, async (r) =>
    notes.updateNote(app.prisma, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.get('/admin/follow-ups', { schema: { querystring: followUpsQuery, response: { 200: z.array(noteSchema) } } }, async (r) =>
    notes.followUps(app.prisma, currentUser(r), r.query.due),
  )

  // ─── Quotes ───
  app.get('/admin/quotes', { schema: { querystring: listQuotesQuery, response: { 200: z.array(adminQuoteSchema) } } }, async (r) =>
    quotes.listAdminQuotes(app.prisma, currentUser(r), r.query.status),
  )
  app.patch('/admin/quotes/:id', { schema: { params: id, body: updateQuoteBody, response: { 200: adminQuoteSchema } } }, async (r) =>
    quotes.updateQuote(deps, currentUser(r), r.params.id, r.body, meta(r)),
  )

  // ─── Inquiries ───
  app.get('/admin/inquiries', { schema: { querystring: listInquiriesQuery, response: { 200: z.array(inquirySchema) } } }, async (r) =>
    inquiries.listInquiries(app.prisma, r.query.status),
  )
  app.patch('/admin/inquiries/:id', { schema: { params: id, body: updateInquiryBody, response: { 200: inquirySchema } } }, async (r) =>
    inquiries.updateInquiry(app.prisma, currentUser(r), r.params.id, r.body.status, meta(r)),
  )
  app.post(
    '/admin/inquiries/:id/convert',
    { schema: { params: id, body: convertInquiryBody, response: { 201: inviteClientResponse.extend({ inquiry: inquirySchema }) } } },
    async (r, reply) => reply.code(201).send(await inquiries.convertInquiry(deps, currentUser(r), r.params.id, r.body, meta(r))),
  )

  // ─── Overview & analytics ───
  app.get('/admin/overview', { schema: { querystring: analyticsQuery, response: { 200: overviewSchema } } }, async (r) =>
    an.overview(app.prisma, currentUser(r), r.query),
  )
  app.get('/admin/analytics', { schema: { querystring: analyticsQuery, response: { 200: analyticsSchema } } }, async (r) =>
    an.analytics(app.prisma, currentUser(r), r.query),
  )
  app.get(
    '/admin/analytics/export.csv',
    { schema: { querystring: analyticsQuery.extend({ report: z.enum(ANALYTICS_REPORTS) }) } },
    async (r, reply) => {
      const { report, ...q } = r.query
      const csv = an.reportCsv(await an.analytics(app.prisma, currentUser(r), q), report)
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="elation-${report}-${new Date().toISOString().slice(0, 10)}.csv"`)
        .send(csv)
    },
  )

  // ─── CMS: inspirations ───
  app.get('/admin/inspirations', { schema: { response: { 200: z.array(adminInspirationSchema) } } }, async () => cms.listAdminInspirations(app.prisma))
  app.post('/admin/inspirations', { schema: { body: inspirationWriteBody, response: { 201: adminInspirationSchema } } }, async (r, reply) =>
    reply.code(201).send(await cms.createInspiration(app.prisma, currentUser(r), r.body, meta(r))),
  )
  app.patch('/admin/inspirations/:id', { schema: { params: id, body: inspirationWriteBody, response: { 200: adminInspirationSchema } } }, async (r) =>
    cms.updateInspiration(app.prisma, currentUser(r), r.params.id, r.body, meta(r)),
  )
  // Publishing puts a concept in front of every client: admins only (P53).
  app.post('/admin/inspirations/:id/publish', { schema: { params: id, response: { 200: adminInspirationSchema } }, ...adminOnly }, async (r) =>
    cms.setPublished(app.prisma, currentUser(r), r.params.id, true, meta(r)),
  )
  app.post('/admin/inspirations/:id/unpublish', { schema: { params: id, response: { 200: adminInspirationSchema } }, ...adminOnly }, async (r) =>
    cms.setPublished(app.prisma, currentUser(r), r.params.id, false, meta(r)),
  )
  app.delete('/admin/inspirations/:id', { schema: { params: id }, ...adminOnly }, async (r, reply) => {
    await cms.deleteInspiration(app.prisma, currentUser(r), r.params.id, meta(r))
    return reply.code(204).send()
  })

  // ─── CMS: AR sets ───
  const arDeps = { db: app.prisma, mailer: app.mailer, appUrl: app.config.APP_URL, log: app.log }
  app.get('/admin/ar-sets', { schema: { response: { 200: z.array(adminArSetSchema) } } }, async (r) => cms.listAdminArSets(app.prisma, currentUser(r)))
  app.post('/admin/ar-sets', { schema: { body: arSetWriteBody, response: { 201: adminArSetSchema } } }, async (r, reply) =>
    reply.code(201).send(await cms.createArSet(app.prisma, currentUser(r), r.body, meta(r))),
  )
  app.patch('/admin/ar-sets/:id', { schema: { params: id, body: arSetWriteBody, response: { 200: adminArSetSchema } } }, async (r) =>
    cms.updateArSet(app.prisma, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.post('/admin/ar-sets/:id/status', { schema: { params: id, body: arStatusBody, response: { 200: adminArSetSchema } } }, async (r) =>
    cms.setArStatus(arDeps, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.post('/admin/ar-sets/:id/assets', { schema: { params: id, body: arAssetWriteBody, response: { 200: adminArSetSchema } } }, async (r) =>
    cms.addArAsset(app.prisma, currentUser(r), r.params.id, r.body, meta(r)),
  )
  app.delete('/admin/ar-sets/:id/assets/:assetId', { schema: { params: assetParams, response: { 200: adminArSetSchema } } }, async (r) =>
    cms.removeArAsset(app.prisma, currentUser(r), r.params.id, r.params.assetId, meta(r)),
  )

  // ─── Team & settings (admin only) ───
  app.get('/admin/team', { schema: { response: { 200: z.array(teamMemberSchema) } }, ...adminOnly }, async () => team.listTeam(app.prisma))
  app.post('/admin/team', { schema: { body: inviteStaffBody, response: { 201: inviteClientResponse } }, ...adminOnly }, async (r, reply) =>
    reply.code(201).send(await inviteStaff(deps, currentUser(r), r.body, meta(r))),
  )
  app.patch('/admin/team/:id', { schema: { params: id, body: updateStaffBody, response: { 200: teamMemberSchema } }, ...adminOnly }, async (r) =>
    team.updateStaff(deps, currentUser(r), r.params.id, r.body, meta(r)),
  )
  // Readable by all staff: consultants need the limits (extension cap, default access) in their forms (P54).
  app.get('/admin/settings', { schema: { response: { 200: settingsSchema } } }, async () => getSettings(app.prisma, app.config))
  app.patch('/admin/settings', { schema: { body: updateSettingsBody, response: { 200: settingsSchema } }, ...adminOnly }, async (r) =>
    updateSettings(app.prisma, app.config, currentUser(r), r.body, meta(r)),
  )

  // ─── Audit ───
  app.get('/admin/audit', { schema: { querystring: z.object({ targetId: z.string().uuid() }), response: { 200: z.array(auditEntrySchema) } }, ...adminOnly }, async (r) =>
    auditFor(app.prisma, r.query.targetId, 200),
  )
}

/** The public "Book a consultation" form (no account needed). */
export const publicInquiryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/public/inquiries',
    { schema: { body: publicInquiryBody, response: { 202: z.object({ ok: z.literal(true) }) } }, preHandler: [rateLimit({ name: 'inquiry', max: 3, windowMs: 60 * 60 * 1000, key: byIp })] },
    async (r, reply) => {
      await inquiries.submitInquiry(app.prisma, r.body)
      return reply.code(202).send({ ok: true as const })
    },
  )
}
