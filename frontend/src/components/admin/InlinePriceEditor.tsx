import { useState, type KeyboardEvent } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { formatPKR } from '@/lib/format'

/**
 * Click-to-edit PKR price. Enter saves, Escape cancels. `onSave` should throw on failure
 * so the field stays open with the typed value.
 */
export function InlinePriceEditor({ value, onSave }: { value: number; onSave: (next: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [saving, setSaving] = useState(false)

  const parsed = Number(draft.replace(/[,\s]/g, ''))
  const valid = draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 0

  async function save() {
    if (!valid) return
    if (parsed === value) return setEditing(false)
    setSaving(true)
    try {
      await onSave(parsed)
      setEditing(false)
    } catch {
      // caller shows the error; keep editing
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void save()
    if (e.key === 'Escape') setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        className="group text-text hover:text-accent inline-flex items-center gap-1.5 font-semibold tabular-nums"
        aria-label={`Edit price, currently ${formatPKR(value)}`}
      >
        {formatPKR(value)}
        <Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-70" />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={saving}
        aria-invalid={!valid}
        className="border-border/20 focus:border-accent bg-surface text-text h-8 w-28 rounded-lg border px-2 text-right text-sm tabular-nums outline-none aria-[invalid=true]:border-danger"
      />
      <button type="button" onClick={() => void save()} disabled={!valid || saving} aria-label="Save price"
        className="text-success hover:bg-success/10 rounded p-1 disabled:opacity-40">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="text-muted hover:bg-surface-2 rounded p-1">
        <X className="h-4 w-4" />
      </button>
    </span>
  )
}
