const PKR = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
})

export function formatPKR(n: number) {
  return PKR.format(n)
}

export function formatPKRCompact(n: number) {
  if (n >= 10_000_000) return `PKR ${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000) return `PKR ${(n / 100_000).toFixed(1)}L`
  if (n >= 1000) return `PKR ${(n / 1000).toFixed(1)}k`
  return PKR.format(n)
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
export function formatDate(iso: string) {
  return dateFmt.format(new Date(iso))
}

/** Event target budget, or a prompt when none is set yet. */
export function formatBudget(n: number | null) {
  return n == null ? 'Budget not set' : formatPKRCompact(n)
}

export function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.round(diff / 86_400_000))
}
