import { useState } from 'react'
import { Download, FileText, Film, Paperclip, RotateCw, Trash2, Upload, X } from 'lucide-react'
import { FILE_RULES, type FileDto, type FilePurposeDto } from '@elation/shared/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { useDeleteFile, useEventFiles } from '@/data/files'
import { acceptFor, useUpload } from '@/lib/upload'
import { cn } from '@/lib/utils'

/** Event detail → Files tab (docs/step-11-files.md): everything uploaded for the event, by purpose. */

const ORDER: FilePurposeDto[] = ['venue-media', 'reference-image', 'attachment', 'ar-model']

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function FileTile({ f, onDelete, deleting }: { f: FileDto; onDelete: () => void; deleting: boolean }) {
  const Icon = f.mime.startsWith('video/') ? Film : f.purpose === 'attachment' ? Paperclip : FileText
  const open = f.url ?? f.downloadUrl
  return (
    <li className="border-border/10 bg-surface group relative overflow-hidden rounded-2xl border">
      <a href={open ?? undefined} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Open ${f.filename}`}>
        {f.thumbUrl ? (
          <img src={f.thumbUrl} alt={f.filename} loading="lazy" className="aspect-square w-full object-cover" />
        ) : (
          <span className="bg-surface-2 text-muted flex aspect-square w-full items-center justify-center">
            <Icon className="h-7 w-7" />
          </span>
        )}
      </a>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-text truncate text-xs font-semibold" title={f.filename}>
            {f.filename}
          </p>
          <p className="text-muted/70 truncate text-[10px]">
            {formatSize(f.sizeBytes)} · {f.ownerName}
          </p>
        </div>
        {f.downloadUrl && (
          <a href={f.downloadUrl} className="text-muted hover:text-text rounded p-1" aria-label={`Download ${f.filename}`}>
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
        {f.canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="text-muted hover:text-danger rounded p-1 disabled:opacity-50"
            aria-label={`Delete ${f.filename}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  )
}

export function EventFiles({ eventId }: { eventId: string }) {
  const query = useEventFiles(eventId)
  const remove = useDeleteFile()
  const [purpose, setPurpose] = useState<FilePurposeDto>('venue-media')
  const { items, upload, retry, dismiss } = useUpload({ purpose, eventId })
  const [confirming, setConfirming] = useState<string | null>(null)

  const files = query.data ?? []
  const groups = ORDER.map((p) => ({ purpose: p, files: files.filter((f) => f.purpose === p) })).filter((g) => g.files.length > 0)
  const active = items.filter((i) => i.status !== 'done')

  function confirmDelete(f: FileDto) {
    if (confirming !== f.id) {
      setConfirming(f.id)
      toast('Delete this file?', {
        description: `${f.filename} will be removed for everyone.`,
        action: {
          label: 'Delete',
          onClick: () =>
            remove.mutate(f, {
              onSuccess: () => toast.success('File deleted'),
              onError: () => toast.error('Couldn’t delete that file', { description: 'Please try again.' }),
              onSettled: () => setConfirming(null),
            }),
        },
        onDismiss: () => setConfirming(null),
        onAutoClose: () => setConfirming(null),
      })
    }
  }

  return (
    <Card className="mt-4">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-text text-lg">Files & references</h2>
            <p className="text-muted mt-0.5 text-xs">Only you, your consultant and Elation can see these. Location data is removed from photos.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as FilePurposeDto)}
              aria-label="What you're uploading"
              className="border-border/15 bg-surface text-text h-9 rounded-xl border px-2 text-xs"
            >
              <option value="venue-media">Venue photos, videos, floor plans</option>
              <option value="reference-image">Reference images</option>
            </select>
            <Button asChild size="sm">
              <label className="cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> Upload
                <input
                  type="file"
                  multiple
                  accept={acceptFor(purpose)}
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length) void upload(e.target.files)
                    e.target.value = ''
                  }}
                />
              </label>
            </Button>
          </div>
        </div>

        {active.length > 0 && (
          <ul className="space-y-2">
            {active.map((u) => (
              <li key={u.localId} className="bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
                <span className="text-text min-w-0 flex-1 truncate">{u.name}</span>
                {u.status === 'uploading' ? (
                  <span className="bg-border/20 h-1.5 w-28 overflow-hidden rounded-full" aria-label={`Uploading ${Math.round(u.progress * 100)}%`}>
                    <span className="bg-accent block h-full transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                ) : (
                  <>
                    <span className="text-danger">{u.error}</span>
                    <button type="button" onClick={() => retry(u.localId)} className="text-accent font-semibold hover:underline">Retry</button>
                    <button type="button" onClick={() => dismiss(u.localId)} aria-label={`Dismiss ${u.name}`} className="hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {query.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="py-8 text-center">
            <p className="text-muted text-sm">Couldn’t load this event’s files.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
              <RotateCw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className="text-muted py-8 text-center text-sm">
            No files yet — add venue photos, a floor plan or reference images here or in the questionnaire.
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.purpose}>
              <h3 className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">
                {FILE_RULES[g.purpose].label} · {g.files.length}
              </h3>
              <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5')}>
                {g.files.map((f) => (
                  <FileTile key={f.id} f={f} onDelete={() => confirmDelete(f)} deleting={remove.isPending && remove.variables?.id === f.id} />
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  )
}
