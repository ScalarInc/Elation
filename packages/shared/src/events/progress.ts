import type { ModuleStatus } from '../domain/enums'
import type { EventProgress, EventStatus, NextStep } from '../api/events'

/**
 * Event progress, status and "next step" are computed, never stored
 * (decision P6). Pure functions — the server uses them for every EventDto
 * and the webapp can use them in mock mode.
 */

export type ProgressInputs = {
  questionnaire: { percentComplete: number; submittedAt: Date | string | null } | null
  moodboards: { status: 'DRAFT' | 'SAVED' | 'ARCHIVED'; isPrimary: boolean }[]
  budgetPlan: { status: 'DRAFT' | 'SUBMITTED' | 'QUOTED' } | null
  arSet: { status: 'READY' | 'RENDERING' | 'COMING_SOON' } | null
}

export function questionnaireStatus(q: ProgressInputs['questionnaire']): ModuleStatus {
  if (!q || q.percentComplete <= 0) return 'pending'
  return q.percentComplete >= 100 || q.submittedAt ? 'complete' : 'in_progress'
}

export function deriveProgress(input: ProgressInputs): EventProgress {
  const live = input.moodboards.filter((m) => m.status !== 'ARCHIVED')
  return {
    questionnaire: questionnaireStatus(input.questionnaire),
    moodboard:
      live.length === 0 ? 'pending' : live.some((m) => m.status === 'SAVED' && m.isPrimary) ? 'complete' : 'in_progress',
    budget: !input.budgetPlan ? 'pending' : input.budgetPlan.status === 'DRAFT' ? 'in_progress' : 'complete',
    ar: !input.arSet ? 'pending' : input.arSet.status === 'READY' ? 'complete' : 'in_progress',
  }
}

/** YYYY-MM-DD for "today" in the given time zone (Pakistan by default). */
export function todayIso(now: Date = new Date(), timeZone = 'Asia/Karachi'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function deriveStatus(
  stored: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
  date: string,
  today: string = todayIso(),
): EventStatus {
  if (stored === 'ARCHIVED') return 'archived'
  if (date < today) return 'past'
  return stored === 'DRAFT' ? 'draft' : 'active'
}

/** Percent across the four modules, for progress bars (complete = 1, in progress = ½). */
export function overallProgressPercent(p: EventProgress): number {
  const weight: Record<ModuleStatus, number> = { complete: 1, in_progress: 0.5, pending: 0 }
  return Math.round(((weight[p.questionnaire] + weight[p.moodboard] + weight[p.budget] + weight[p.ar]) / 4) * 100)
}

export function deriveNextStep(eventId: string, p: EventProgress, questionnairePercent: number): NextStep {
  if (p.questionnaire !== 'complete') {
    return p.questionnaire === 'pending'
      ? {
          title: 'Start your questionnaire',
          body: 'A few questions about the feel you want — Elation curates everything else from your answers.',
          href: `/events/${eventId}/questionnaire`,
        }
      : {
          title: 'Continue your questionnaire',
          body: `You're ${questionnairePercent}% through — a few more answers and Elation can lock the concept.`,
          href: `/events/${eventId}/questionnaire`,
        }
  }
  if (p.moodboard !== 'complete') {
    return {
      title: 'Review your moodboard',
      body: 'Elation has curated concepts from your answers — pick the one that feels like you.',
      href: `/events/${eventId}?tab=moodboard`,
    }
  }
  if (p.budget !== 'complete') {
    return {
      title: 'Tune your budget',
      body: 'Live line items from Elation’s inventory, with a traffic-light check against your target.',
      href: `/events/${eventId}/budget`,
    }
  }
  if (p.ar !== 'complete') {
    return {
      title: 'Preview in AR',
      body: 'Your AR walkthrough is being prepared for Meta Quest 3.',
      href: `/events/${eventId}/ar`,
    }
  }
  return {
    title: 'Everything is in place',
    body: 'Your concept, budget and AR preview are ready. Your consultant will be in touch about the final details.',
    href: `/events/${eventId}`,
  }
}
