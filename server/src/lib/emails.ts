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
}): Mail {
  const by = input.consultantName ? `${input.consultantName} from Elation` : 'The Elation studio'
  const until = input.expiresAt.toUTCString().slice(0, 16)
  return {
    to: input.to,
    subject: 'Your Elation X studio is ready',
    text: `Assalamu Alaikum ${input.name},

${by} has opened your private Elation X studio — your questionnaire, curated moodboards and budget, all in one place.

Activate your account (link valid until ${until}):
${input.activationUrl}

Invitation code: ${input.code}

Elation by FMH`,
    html: layout(
      `Welcome, ${escapeHtml(input.name)}`,
      `<p>${escapeHtml(by)} has opened your private Elation X studio — your questionnaire, curated moodboards and budget, all in one place.</p>
       <p style="color:#7a7a80;font-size:13px">This invitation is valid until ${until}.</p>`,
      { label: 'Activate my studio', url: input.activationUrl },
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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
