import type { Mail } from './mailer'

/**
 * Email copy. Plain, warm, on-brand ("Elation curated", never "AI").
 * HTML is deliberately simple inline markup so it renders in every client.
 */

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const button = cta
    ? `<p style="margin:28px 0"><a href="${cta.url}" style="background:#D3A79F;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600">${cta.label}</a></p>
       <p style="color:#7a7a80;font-size:12px">Or paste this link into your browser:<br>${cta.url}</p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#FAF3EF;font-family:Lato,Helvetica,Arial,sans-serif;color:#3B3A3F">
  <div style="max-width:520px;margin:0 auto;padding:40px 28px">
    <p style="letter-spacing:.3em;font-size:13px;margin:0 0 28px">ELATION <span style="color:#D3A79F">X</span></p>
    <h1 style="font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:26px;margin:0 0 16px">${title}</h1>
    ${body}
    ${button}
    <p style="color:#7a7a80;font-size:12px;margin-top:36px">Elation by FMH</p>
  </div></body></html>`
}

export function inviteEmail(input: {
  to: string
  name: string
  consultantName: string | null
  activationUrl: string
  code: string
  expiresAt: Date
  /** Editable line from admin settings. */
  intro?: string
  /** Team invite (consultant / admin) instead of a client studio. */
  staff?: boolean
}): Mail {
  const by = input.consultantName ? `${input.consultantName} from Elation` : 'The Elation studio'
  const until = input.expiresAt.toUTCString().slice(0, 16)
  const what = input.staff
    ? 'has added you to the Elation X team console — clients, conversations, quotes and the catalogue, all in one place.'
    : 'has opened your private Elation X studio — your questionnaire, curated moodboards and budget, all in one place.'
  const intro = input.intro?.trim() ? `${input.intro.trim()}

` : ''
  return {
    to: input.to,
    subject: input.staff ? 'You’re invited to the Elation X team' : 'Your Elation X studio is ready',
    text: `Assalamu Alaikum ${input.name},

${intro}${by} ${what}

Activate your account (link valid until ${until}):
${input.activationUrl}

Invitation code: ${input.code}

Elation by FMH`,
    html: layout(
      `Welcome, ${escapeHtml(input.name)}`,
      `${intro ? `<p>${escapeHtml(input.intro!.trim())}</p>` : ''}<p>${escapeHtml(by)} ${what}</p>
       <p style="color:#7a7a80;font-size:13px">This invitation is valid until ${until}.</p>`,
      { label: input.staff ? 'Join the team' : 'Activate my studio', url: input.activationUrl },
    ),
  }
}

export function passwordResetEmail(input: { to: string; name: string; resetUrl: string }): Mail {
  return {
    to: input.to,
    subject: 'Reset your Elation X password',
    text: `Hi ${input.name},

Someone (hopefully you) asked to reset your Elation X password. This link works for 30 minutes:
${input.resetUrl}

If it wasn't you, you can ignore this email — your password stays the same.

Elation by FMH`,
    html: layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(input.name)}, someone (hopefully you) asked to reset your Elation X password. The link works for 30 minutes.</p>
       <p style="color:#7a7a80;font-size:13px">If it wasn't you, ignore this email — your password stays the same.</p>`,
      { label: 'Choose a new password', url: input.resetUrl },
    ),
  }
}

export function budgetForConsultantEmail(input: {
  to: string
  consultantName: string
  clientName: string
  eventName: string
  totalPkr: number
  targetPkr: number
  note?: string
  kind: 'review' | 'quote'
  url: string
}): Mail {
  const pkr = (n: number) => `PKR ${n.toLocaleString('en-PK')}`
  const action = input.kind === 'quote' ? 'requested a quote' : 'sent you their budget to review'
  const subject = `${input.clientName} ${input.kind === 'quote' ? 'requested a quote' : 'sent a budget'} — ${input.eventName}`
  const quoted = input.note ? `

“${input.note}”` : ''
  return {
    to: input.to,
    subject,
    text: `Hi ${input.consultantName},

${input.clientName} ${action} for ${input.eventName}: ${pkr(input.totalPkr)} against a target of ${pkr(input.targetPkr)}.${quoted}

Open the estimator:
${input.url}

Elation X`,
    html: layout(
      escapeHtml(subject),
      `<p>Hi ${escapeHtml(input.consultantName)}, ${escapeHtml(input.clientName)} ${action} for <strong>${escapeHtml(input.eventName)}</strong>.</p>
       <p style="font-size:18px">${pkr(input.totalPkr)} <span style="color:#7a7a80;font-size:13px">of ${pkr(input.targetPkr)}</span></p>
       ${input.note ? `<blockquote style="border-left:3px solid #E3BFB9;margin:0;padding:4px 12px;color:#55545a">${escapeHtml(input.note)}</blockquote>` : ''}`,
      { label: 'Open the estimator', url: input.url },
    ),
  }
}

export function arSessionRequestEmail(input: {
  to: string
  consultantName: string
  clientName: string
  eventName: string
  preferredDate?: string
  note?: string
  url: string
}): Mail {
  const when = input.preferredDate ? ` — preferred date ${input.preferredDate}` : ''
  return {
    to: input.to,
    subject: `${input.clientName} would like an AR session — ${input.eventName}`,
    text: `Hi ${input.consultantName},

${input.clientName} asked for an AR headset session for ${input.eventName}${when}.${input.note ? `\n\n“${input.note}”` : ''}

${input.url}

Elation X`,
    html: layout(
      'AR session request',
      `<p>Hi ${escapeHtml(input.consultantName)}, ${escapeHtml(input.clientName)} asked for an AR headset session for <strong>${escapeHtml(input.eventName)}</strong>${escapeHtml(when)}.</p>
       ${input.note ? `<blockquote style="border-left:3px solid #E3BFB9;margin:0;padding:4px 12px;color:#55545a">${escapeHtml(input.note)}</blockquote>` : ''}`,
      { label: 'Open the event', url: input.url },
    ),
  }
}

export function arReadyEmail(input: { to: string; name: string; setTitle: string; url: string }): Mail {
  return {
    to: input.to,
    subject: `${input.setTitle} is ready to preview`,
    text: `Hi ${input.name},

${input.setTitle} is ready — you can now walk through it on Meta Quest 3.

${input.url}

Elation by FMH`,
    html: layout(
      'Your AR set is ready',
      `<p>Hi ${escapeHtml(input.name)}, <strong>${escapeHtml(input.setTitle)}</strong> is ready — you can now walk through it on Meta Quest 3.</p>`,
      { label: 'See the set', url: input.url },
    ),
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function unreadMessagesEmail(input: {
  to: string
  name: string
  threads: { title: string; count: number; from: string; preview: string }[]
  url: string
}): Mail {
  const total = input.threads.reduce((n, t) => n + t.count, 0)
  const noun = total === 1 ? 'message' : 'messages'
  const lines = input.threads.map((t) => `${t.title} — ${t.count} from ${t.from}: “${t.preview}”`).join('\n')
  return {
    to: input.to,
    subject: `${total} unread ${noun} in Elation X`,
    text: `Hi ${input.name},

You have ${total} unread ${noun}:

${lines}

${input.url}

Elation by FMH`,
    html: layout(
      `You have ${total} unread ${noun}`,
      `<p>Hi ${escapeHtml(input.name)},</p>
       ${input.threads
         .map(
           (t) =>
             `<p style="margin:14px 0"><strong>${escapeHtml(t.title)}</strong> · ${t.count} from ${escapeHtml(t.from)}<br><span style="color:#55545a">“${escapeHtml(t.preview)}”</span></p>`,
         )
         .join('')}`,
      { label: 'Open messages', url: input.url },
    ),
  }
}

/** Dates as Elation's clients read them: Pakistan time. */
export const formatPkDate = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).format(d)

export function accessExtendedEmail(input: { to: string; name: string; until: Date; url: string }): Mail {
  const until = formatPkDate(input.until)
  return {
    to: input.to,
    subject: `Your Elation X access now runs to ${until}`,
    text: `Hi ${input.name},

Your Elation X studio is open until ${until}.

${input.url}

Elation by FMH`,
    html: layout('Your access was extended', `<p>Hi ${escapeHtml(input.name)}, your Elation X studio is open until <strong>${escapeHtml(until)}</strong>.</p>`, {
      label: 'Open my studio',
      url: input.url,
    }),
  }
}

export function quoteReadyEmail(input: { to: string; name: string; eventName: string; totalPkr: number; message?: string; url: string }): Mail {
  const total = `PKR ${input.totalPkr.toLocaleString('en-PK')}`
  return {
    to: input.to,
    subject: `Your quote for ${input.eventName} is ready`,
    text: `Hi ${input.name},

Elation has prepared your quote for ${input.eventName} (${total}).${input.message ? `\n\n“${input.message}”` : ''}

${input.url}

Elation by FMH`,
    html: layout(
      'Your quote is ready',
      `<p>Hi ${escapeHtml(input.name)}, Elation has prepared your quote for <strong>${escapeHtml(input.eventName)}</strong> (${total}).</p>
       ${input.message ? `<blockquote style="border-left:3px solid #E3BFB9;margin:0;padding:4px 12px;color:#55545a">${escapeHtml(input.message)}</blockquote>` : ''}`,
      { label: 'See my budget', url: input.url },
    ),
  }
}
