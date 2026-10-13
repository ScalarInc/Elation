import { useState } from 'react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { formatDate } from '@/lib/format'
import type { AdminClient, AdminSummary } from '@/types/admin'

const QUICK_EXTENSIONS = [7, 30, 90]

/** yyyy-mm-dd for <input type="date">, in local time. */
function toDateInput(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Extends from today when access already ended, otherwise from the current end date. */
function extendBy(currentIso: string, days: number) {
  const base = Math.max(Date.now(), new Date(currentIso).getTime())
  return toDateInput(new Date(base + days * 86_400_000).toISOString())
}

/** Edit access end date and consultant for one client. */
export function ManageAccessDialog({
  client,
  admins,
  onClose,
  onSaved,
}: {
  client: AdminClient | null
  admins: AdminSummary[]
  onClose: () => void
  onSaved: (client: AdminClient) => void
}) {
  return (
    <Dialog open={client !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {/* Keyed so the form resets whenever a different client is opened. */}
        {client && <AccessForm key={client.id} client={client} admins={admins} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function AccessForm({
  client,
  admins,
  onClose,
  onSaved,
}: {
  client: AdminClient
  admins: AdminSummary[]
  onClose: () => void
  onSaved: (client: AdminClient) => void
}) {
  const [endDate, setEndDate] = useState(toDateInput(client.accessExpiresAt))
  const [consultantId, setConsultantId] = useState(client.consultant?.id ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!endDate) return
    setSaving(true)
    try {
      // Access lasts until the end of the chosen day, local time.
      const accessExpiresAt = new Date(`${endDate}T23:59:59`).toISOString()
      const saved = await adminApi.clients.update(client.id, { accessExpiresAt, consultantId: consultantId || null })
      onSaved(saved)
      toast.success(`Access updated: until ${formatDate(saved.accessExpiresAt)}`)
      onClose()
    } catch (err) {
      toast.error('Could not update access', { description: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Manage access</DialogTitle>
        <DialogDescription>
          {client.name} · currently {client.status === 'expired' ? 'ended on' : 'until'}{' '}
          {formatDate(client.accessExpiresAt)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 pt-2">
        <div className="space-y-1.5">
          <Label htmlFor="endDate">Access ends on</Label>
          <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_EXTENSIONS.map((days) => (
              <Button
                key={days}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEndDate(extendBy(client.accessExpiresAt, days))}
              >
                +{days} days
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="consultant">Consultant</Label>
          <select
            id="consultant"
            value={consultantId}
            onChange={(e) => setConsultantId(e.target.value)}
            className="border-border/15 bg-surface text-text focus:border-accent flex h-10 w-full rounded-xl border px-3 text-sm outline-none"
          >
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !endDate}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </>
  )
}
