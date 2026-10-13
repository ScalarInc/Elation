import { useState } from 'react'
import { Box, Trash2, Upload } from 'lucide-react'
import type { AdminArSetDto } from '@elation/shared/api'
import { AdminPage, LoadError, Panel, Rows } from '@/components/admin/kit'
import { formatDay, inputClass } from '@/components/admin/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminArSets, useAdminMutation } from '@/data/admin'
import { isApiError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { acceptFor, uploadFile } from '@/lib/upload'

const fail = (err: unknown) => toast.error(isApiError(err) ? err.message : err instanceof Error ? err.message : 'That didn’t work')
const keys = [['admin', 'ar-sets'], ['ar-sets']]
const VARIANT = { ready: 'success', rendering: 'accent', 'coming-soon': 'outline' } as const
const LABEL = { ready: 'Ready', rendering: 'Rendering', 'coming-soon': 'Coming soon' } as const

function SetCard({ s }: { s: AdminArSetDto }) {
  const status = useAdminMutation((v: { status: string; progressPercent: number; eta: string | null }) => adminApi.arStatus(s.id, v), keys)
  const addAsset = useAdminMutation((v: { name: string; source: string; modelFileId: string }) => adminApi.addAsset(s.id, v), keys)
  const removeAsset = useAdminMutation((assetId: string) => adminApi.removeAsset(s.id, assetId), keys)
  const [form, setForm] = useState({ status: s.status as string, progress: String(s.progressPercent), eta: s.eta ?? '' })
  const [uploading, setUploading] = useState<number | null>(null)
  const [source, setSource] = useState('Tripo AI')
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  async function uploadModel(file: File | undefined) {
    if (!file) return
    setUploading(0)
    try {
      const f = await uploadFile(file, { purpose: 'ar-model', onProgress: (p) => setUploading(p) })
      await addAsset.mutateAsync({ name: file.name.replace(/\.[^.]+$/, ''), source, modelFileId: f.id })
      toast.success('Model added')
    } catch (err) {
      fail(err)
    } finally {
      setUploading(null)
    }
  }

  const willNotify = form.status === 'ready' && s.status !== 'ready' && s.notifyCount > 0
  return (
    <Panel>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this model'}?`}
        description="It leaves the set’s asset list (and the client’s downloads)."
        confirmLabel="Remove"
        busy={removeAsset.isPending}
        onConfirm={() => removeAsset.mutate(removing!.id, { onSuccess: () => setRemoving(null), onError: fail })}
      />
      <div className="flex flex-wrap items-start gap-4">
        <img src={s.coverUrl} alt="" className="h-20 w-32 rounded-xl object-cover" />
        <div className="min-w-[200px] flex-1">
          <p className="font-display text-text text-lg">
            {s.title} <Badge variant={VARIANT[s.status]}>{LABEL[s.status]}</Badge>
          </p>
          <p className="text-muted text-xs">
            {s.eventName ? `${s.eventName} · ${s.clientName}` : 'Showcase set'} · {s.eventType} · {s.theme}
          </p>
          <p className="text-muted/70 mt-1 text-xs">
            {s.progressPercent}% · ETA {formatDay(s.eta)} · {s.notifyCount} waiting for “ready”
          </p>
        </div>
      </div>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          status.mutate(
            { status: form.status, progressPercent: Number(form.progress), eta: form.eta || null },
            { onSuccess: () => toast.success(willNotify ? `Updated — ${s.notifyCount} client${s.notifyCount === 1 ? '' : 's'} emailed` : 'Status updated'), onError: fail },
          )
        }}
      >
        <label className="text-muted text-xs">
          Status
          <select className={cn(inputClass, 'mt-1 w-36')} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="coming-soon">Coming soon</option>
            <option value="rendering">Rendering</option>
            <option value="ready">Ready</option>
          </select>
        </label>
        <label className="text-muted text-xs">
          Progress %
          <input type="number" min={0} max={100} className={cn(inputClass, 'mt-1 w-20')} value={form.progress} onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))} />
        </label>
        <label className="text-muted text-xs">
          ETA
          <input type="date" className={cn(inputClass, 'mt-1 w-auto')} value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} />
        </label>
        <Button type="submit" size="sm" disabled={status.isPending}>
          {willNotify ? 'Save & notify' : 'Save'}
        </Button>
      </form>

      <div className="mt-5">
        <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">3D models · {s.assets.length}</p>
        <ul className="divide-border/10 divide-y text-sm">
          {s.assets.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <Box className="text-muted h-4 w-4" />
              <span className="text-text min-w-0 flex-1 truncate">{a.name}</span>
              <span className="text-muted text-xs">{a.modelFilename ?? 'No model file'}</span>
              <span className="text-muted/70 text-xs">{a.source}</span>
              <button type="button" aria-label={`Remove ${a.name}`} className="text-muted hover:text-danger" disabled={removeAsset.isPending} onClick={() => setRemoving(a)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Made with" className={cn(inputClass, 'h-8 w-auto')} value={source} onChange={(e) => setSource(e.target.value)}>
            <option>Tripo AI</option>
            <option>Meshy AI</option>
            <option value="manual">Manual</option>
          </select>
          <Button asChild size="sm" variant="outline" disabled={uploading !== null}>
            <label className="cursor-pointer">
              <Upload className="h-3.5 w-3.5" /> {uploading !== null ? `Uploading ${Math.round(uploading * 100)}%` : 'Upload GLB / OBJ'}
              <input type="file" accept={acceptFor('ar-model')} className="sr-only" onChange={(e) => (void uploadModel(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
          </Button>
        </div>
      </div>
    </Panel>
  )
}

export function ArSetsAdminPage() {
  const query = useAdminArSets()
  return (
    <AdminPage title="AR sets" description="Progress of each event’s AR walk-through. Marking a set ready emails everyone who asked to be notified.">
      {query.isError ? (
        <LoadError onRetry={() => void query.refetch()} what="AR sets" />
      ) : query.isPending ? (
        <Rows />
      ) : query.data.length === 0 ? (
        <p className="text-muted py-10 text-center text-sm">No AR sets yet.</p>
      ) : (
        <div className="space-y-4">
          {query.data.map((s) => (
            <SetCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </AdminPage>
  )
}
