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
    if (error) throw new Error(`Email to ${mail.to} failed: ${error.message}`)
  }
}

/** Development: no provider configured — print the email (links included) to the log. */
export class LogMailer implements Mailer {
  constructor(private readonly log: FastifyBaseLogger) {}

  async send(mail: Mail) {
    this.log.info({ to: mail.to, subject: mail.subject }, `✉️  email (not sent — no RESEND_API_KEY)\n${mail.text}`)
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
