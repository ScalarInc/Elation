/** Formatting helpers for the admin console. */

export const inputClass =
  'border-border/15 bg-surface text-text focus:border-accent h-10 w-full rounded-xl border px-3 text-sm outline-none transition'

export const formatDay = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)) : '—'

export const formatPkr = (n: number | null | undefined) => (n == null ? '—' : `PKR ${Math.round(n).toLocaleString('en-PK')}`)

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days < 14 ? `${days}d ago` : formatDay(iso)
}

/** "Copied" helper for activation links (WhatsApp sharing). */
export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
