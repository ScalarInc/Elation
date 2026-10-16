import { useEffect, useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ConsultationNote } from '@/types/admin'

/** Follow-up notes for one client: add a note (optionally with a due date) and tick it off. */
export function ClientNotes({ clientId, onChange }: { clientId: string; onChange: () => void }) {
  const [notes, setNotes] = useState<ConsultationNote[] | null>(null)
  const [body, setBody] = useState('')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    adminApi.consultations.notes(clientId).then(
      (rows) => !cancelled && setNotes(rows),
      () => !cancelled && setNotes([]),
    )
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      const followUpAt = due ? new Date(`${due}T10:00:00`).toISOString() : null
      const note = await adminApi.consultations.addNote(clientId, { body: body.trim(), followUpAt })
      setNotes((prev) => [note, ...(prev ?? [])])
      setBody('')
      setDue('')
      onChange()
    } catch (err) {
      toast.error("Couldn't save the note", { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function toggle(note: ConsultationNote) {
    try {
      const saved = await adminApi.consultations.setNoteDone(note.id, !note.completedAt)
      setNotes((prev) => (prev ?? []).map((n) => (n.id === saved.id ? saved : n)))
      onChange()
    } catch (err) {
      toast.error("Couldn't update", { description: (err as Error).message })
    }
  }

  return (
    <div>
      <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">Notes & follow-ups</p>
      <form onSubmit={add} className="space-y-2">
        <Textarea rows={2} placeholder="Call notes, next steps…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex items-center gap-2">
          <label className="text-muted flex items-center gap-2 text-xs">
            Follow up on
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" />
          </label>
          <Button type="submit" size="sm" className="ml-auto" disabled={saving || !body.trim()}>
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      </form>

      {notes === null ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : notes.length === 0 ? (
        <p className="text-muted mt-3 text-xs">No notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => {
            const overdue = n.followUpAt && !n.completedAt && new Date(n.followUpAt) < new Date()
            return (
              <li key={n.id} className="border-border/10 flex items-start gap-3 rounded-xl border p-3 text-sm">
                {n.followUpAt ? (
                  <button
                    type="button"
                    onClick={() => void toggle(n)}
                    aria-label={n.completedAt ? 'Mark follow-up as not done' : 'Mark follow-up as done'}
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                      n.completedAt ? 'bg-success border-success text-white' : 'border-border/40',
                    )}
                  >
                    {n.completedAt && <Check className="h-3 w-3" />}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn('text-text whitespace-pre-wrap', n.completedAt && 'text-muted line-through')}>{n.body}</p>
                  <p className="text-muted/70 mt-1 text-[11px]">
                    {n.authorName ?? 'Admin'} · {formatDate(n.createdAt)}
                    {n.followUpAt && (
                      <span className={cn('ml-2', overdue && 'text-danger font-semibold')}>
                        Follow up {formatDate(n.followUpAt)}
                        {overdue && ' (overdue)'}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
