import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { BudgetState } from '@elation/shared/budget'

/** Traffic light, as the spec words it (P8): green on budget, yellow under, red over. */
export const BUDGET_TONE: Record<BudgetState, { pill: string; card: string; dot: string; label: string; Icon: typeof CheckCircle2 }> = {
  green: {
    pill: 'bg-success/15 border-success/40 text-success',
    card: 'bg-success/15 border-success/40 text-success',
    dot: 'bg-success',
    label: 'On budget',
    Icon: CheckCircle2,
  },
  yellow: {
    pill: 'bg-warning/15 border-warning/40 text-warning',
    card: 'bg-warning/15 border-warning/40 text-warning',
    dot: 'bg-warning',
    label: 'Under budget',
    Icon: AlertTriangle,
  },
  red: {
    pill: 'bg-danger/15 border-danger/40 text-danger',
    card: 'bg-danger/15 border-danger/40 text-danger',
    dot: 'bg-danger',
    label: 'Over budget',
    Icon: AlertOctagon,
  },
}

/** Where "back" goes from the estimator (`?from=`), so the journey returns where it started. */
export function backTarget(from: string | null, eventId: string, eventName: string) {
  switch (from) {
    case 'events':
      return { to: '/events', label: 'My Events' }
    case 'budget':
      return { to: '/budget', label: 'Your budgets' }
    case 'dashboard':
      return { to: '/dashboard', label: 'Dashboard' }
    default:
      return { to: `/events/${eventId}`, label: eventName }
  }
}
