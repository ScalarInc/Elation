import type * as React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { GUEST_RANGES, type PublicInquiryBody } from '@elation/shared/api'
import { EVENT_TYPES } from '@elation/shared/domain'
import { questionById } from '@elation/shared/questionnaire'
import { AuthShell } from '@/components/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { adminApi } from '@/data/admin'
import { isApiError } from '@/lib/api/client'

const select = 'border-border/15 bg-surface text-text focus:border-accent flex h-11 w-full rounded-xl border px-4 text-sm outline-none transition'
const BUDGET_BANDS = (questionById.get('q121_budget')?.options ?? []) as string[]

/** Public "Book a consultation" form (docs/step-12-admin.md) → the inquiries inbox. */
export function BookConsultationPage() {
  const [f, setF] = useState<Record<string, string>>({ eventType: '', guestRange: '', budgetBand: '' })
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const body: PublicInquiryBody = {
      name: f.name?.trim() ?? '',
      email: f.email?.trim() ?? '',
      phone: f.phone?.trim() || undefined,
      eventType: (f.eventType || undefined) as PublicInquiryBody['eventType'],
      eventDate: f.eventDate || undefined,
      guestRange: (f.guestRange || undefined) as PublicInquiryBody['guestRange'],
      city: f.city?.trim() || undefined,
      budgetBand: f.budgetBand || undefined,
      source: f.source?.trim() || undefined,
      message: f.message?.trim() || undefined,
      website: f.website || undefined,
    }
    try {
      await adminApi.submitInquiry(body)
      setSent(true)
    } catch (err) {
      setError(isApiError(err, 'RATE_LIMITED') ? 'We already have your request — the team will be in touch.' : isApiError(err) ? err.message : 'Something went wrong — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      {sent ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="text-success mx-auto h-10 w-10" />
          <h1 className="font-display text-text text-2xl">Thank you</h1>
          <p className="text-muted text-sm">A consultant from Elation will call you within 24 hours to plan your consultation.</p>
          <Button asChild variant="outline">
            <Link to="/auth?mode=signin">Already a client? Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <h1 className="font-display text-text text-2xl">Book a consultation</h1>
            <p className="text-muted mt-1 text-sm">Share the essentials and your consultant will call within 24 hours.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Your name</Label>
              <Input id="b-name" required minLength={2} autoComplete="name" value={f.name ?? ''} onChange={set('name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-email">Email</Label>
              <Input id="b-email" type="email" required autoComplete="email" value={f.email ?? ''} onChange={set('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-phone">Phone / WhatsApp</Label>
              <Input id="b-phone" autoComplete="tel" value={f.phone ?? ''} onChange={set('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-type">Event</Label>
              <select id="b-type" className={select} value={f.eventType} onChange={set('eventType')}>
                <option value="">Choose…</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-date">Date</Label>
              <Input id="b-date" type="date" value={f.eventDate ?? ''} onChange={set('eventDate')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-guests">Guests</Label>
              <select id="b-guests" className={select} value={f.guestRange} onChange={set('guestRange')}>
                <option value="">Choose…</option>
                {GUEST_RANGES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-city">City</Label>
              <Input id="b-city" value={f.city ?? ''} onChange={set('city')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-budget">Décor budget</Label>
              <select id="b-budget" className={select} value={f.budgetBand} onChange={set('budgetBand')}>
                <option value="">Choose…</option>
                {BUDGET_BANDS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-message">Anything you’d like us to know?</Label>
            <Textarea id="b-message" rows={3} maxLength={2000} value={f.message ?? ''} onChange={set('message')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-source">How did you hear about Elation?</Label>
            <Input id="b-source" value={f.source ?? ''} onChange={set('source')} />
          </div>
          {/* Honeypot: hidden from people, filled by bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website ?? ''} onChange={set('website')} />
          {error && <p className="text-danger text-sm">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Request a consultation'}
          </Button>
          <p className="text-muted/70 text-center text-xs">We only use these details to contact you about your event.</p>
        </form>
      )}
    </AuthShell>
  )
}
