import type { FastifyBaseLogger } from 'fastify'
import { Resend } from 'resend'

export type Mail = {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/** Sends through Resend (production / staging). */
export class ResendMailer implements Mailer {
  private readonly client: Resend
  private readonly from: string

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey)
    this.from = from
  }

  async send(mail: Mail) {
    const { error } = await this.client.emails.send({ from: this.from, ...mail })
    // No address in the message: errors end up in logs and Sentry.
    if (error) throw new Error(`Email "${mail.subject}" failed: ${error.message}`)
  }
}

/**
 * No provider configured. Development: print the email, links included, so
 * invites and resets can be followed. Anywhere else the send fails: the body
 * carries one-time links that must not sit in a log drain.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly log: FastifyBaseLogger,
    private readonly showBody = true,
  ) {}

  async send(mail: Mail) {
    if (!this.showBody) {
      // Fail like a provider outage would: callers report "not emailed" and share the link instead.
      throw new Error(`Email "${mail.subject}" not sent: RESEND_API_KEY is not set`)
    }
    this.log.info(`✉️  email to ${mail.to} (not sent — no RESEND_API_KEY): ${mail.subject}\n${mail.text}`)
  }
}

/** Tests: keep emails in memory so assertions can read links out of them. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []

  async send(mail: Mail) {
    this.sent.push(mail)
  }

  last(to?: string): Mail | undefined {
    return [...this.sent].reverse().find((m) => !to || m.to === to)
  }
}
