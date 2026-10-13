import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Sparkles, Upload, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useQuestionnaire } from './store'
import type { Question } from '@elation/shared/questionnaire'
import type { FilePurposeDto } from '@elation/shared/api'
import { useEventFiles } from '@/data/files'
import { API_MODE } from '@/lib/api/client'
import { acceptFor, useUpload } from '@/lib/upload'

type Props = { eventId: string; question: Question }

function useValue(eventId: string, qid: string) {
  return useQuestionnaire((s) => s.byEvent[eventId]?.answers[qid])
}
function useDecides(eventId: string, qid: string) {
  return useQuestionnaire((s) => !!s.byEvent[eventId]?.elationDecides[qid])
}

function ElationDecidesChip({ eventId, qid }: { eventId: string; qid: string }) {
  const isOn = useDecides(eventId, qid)
  const setDecides = useQuestionnaire((s) => s.setElationDecides)
  return (
    <button
      type="button"
      onClick={() => setDecides(eventId, qid, !isOn)}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition',
        isOn
          ? 'border-accent bg-accent text-accent-fg shadow-sm'
          : 'border-border/20 text-muted hover:border-accent/40 hover:bg-accent/5 hover:text-text',
      )}
      aria-pressed={isOn}
    >
      <Sparkles className={cn('h-3.5 w-3.5 transition', !isOn && 'group-hover:text-accent')} />
      {isOn ? "Elation's deciding this" : 'Let Elation decide'}
    </button>
  )
}

// ---------------- Field variants ----------------

function ChipGrid({ eventId, q, multi }: { eventId: string; q: Question; multi: boolean }) {
  const value = useValue(eventId, q.id)
  const set = useQuestionnaire((s) => s.setAnswer)
  const toggle = useQuestionnaire((s) => s.toggleAnswer)
  const selected: string[] = multi
    ? Array.isArray(value) ? (value as string[]) : []
    : typeof value === 'string' ? [value] : []

  return (
    <div className="flex flex-wrap gap-2">
      {q.options?.map((opt) => {
        const isOn = selected.includes(opt)
        return (
          <motion.button
            key={opt}
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={() =>
              multi ? toggle(eventId, q.id, opt) : set(eventId, q.id, isOn ? undefined : opt)
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition',
              isOn
                ? 'border-accent bg-accent text-accent-fg shadow-sm'
                : 'border-border/20 bg-surface text-muted hover:border-accent/40 hover:bg-accent/5 hover:text-text',
            )}
          >
            {isOn && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {opt}
          </motion.button>
        )
      })}
    </div>
  )
}

function TextField({ eventId, question }: Props) {
  const value = useValue(eventId, question.id) as string | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => set(eventId, question.id, e.target.value)}
      placeholder="Type your answer…"
    />
  )
}

function TextareaField({ eventId, question }: Props) {
  const value = useValue(eventId, question.id) as string | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  return (
    <Textarea
      value={value ?? ''}
      onChange={(e) => set(eventId, question.id, e.target.value)}
      rows={4}
      placeholder="Take your time — even a rough thought helps."
    />
  )
}

function NumberField({ eventId, question }: Props) {
  const value = useValue(eventId, question.id) as number | string | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  return (
    <Input
      type="number"
      min={0}
      value={value ?? ''}
      onChange={(e) =>
        set(eventId, question.id, e.target.value === '' ? undefined : Number(e.target.value))
      }
      className="max-w-xs"
      placeholder="e.g. 320"
    />
  )
}

function DateField({ eventId, question }: Props) {
  const value = useValue(eventId, question.id) as string | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  return (
    <Input
      type="date"
      value={value ?? ''}
      onChange={(e) => set(eventId, question.id, e.target.value)}
      className="max-w-xs"
    />
  )
}

function DimensionsField({ eventId, question }: Props) {
  const raw = useValue(eventId, question.id) as { w?: number; d?: number } | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  const setPart = (key: 'w' | 'd', v: string) =>
    set(eventId, question.id, { ...(raw ?? {}), [key]: v === '' ? undefined : Number(v) })

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <span className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Width (ft)</span>
        <Input type="number" min={0} value={raw?.w ?? ''} onChange={(e) => setPart('w', e.target.value)} className="w-32" />
      </div>
      <span className="text-muted mb-2 text-lg">×</span>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Depth (ft)</span>
        <Input type="number" min={0} value={raw?.d ?? ''} onChange={(e) => setPart('d', e.target.value)} className="w-32" />
      </div>
    </div>
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Real uploads (docs/step-11-files.md): the answer is the list of file ids. */
function UploadField({ eventId, question }: Props) {
  const value = (useValue(eventId, question.id) as string[] | undefined) ?? []
  const set = useQuestionnaire((s) => s.setAnswer)
  const purpose: FilePurposeDto = question.id === 'q13_references' ? 'reference-image' : 'venue-media'
  const { data: files } = useEventFiles(API_MODE === 'http' ? eventId : undefined)
  const [dragging, setDragging] = useState(false)
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  })
  const { items, upload, retry, dismiss } = useUpload({
    purpose,
    eventId,
    questionId: question.id,
    onDone: (f) => {
      set(eventId, question.id, [...latest.current, f.id])
      latest.current = [...latest.current, f.id]
    },
  })

  function pick(list: FileList | null) {
    if (!list?.length) return
    if (API_MODE === 'mock') {
      set(eventId, question.id, [...value, ...Array.from(list).map((f) => f.name)])
      return
    }
    void upload(list)
  }

  // Takes the file off this answer only; it stays in the event's Files tab (delete it there).
  function removeEntry(entry: string) {
    set(eventId, question.id, value.filter((v) => v !== entry))
  }

  const byId = new Map((files ?? []).map((f) => [f.id, f]))
  const uploading = items.filter((i) => i.status !== 'done')

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          pick(e.dataTransfer.files)
        }}
        className={cn(
          'border-border/25 hover:border-accent/50 hover:bg-accent/5 group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
          dragging && 'border-accent bg-accent/10',
        )}
      >
        <span className="bg-accent/15 text-accent flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105">
          <Upload className="h-5 w-5" />
        </span>
        <p className="text-text mt-1 text-sm font-semibold">Drop files here or tap to upload</p>
        <p className="text-muted/70 text-xs">
          {purpose === 'venue-media' ? 'Photos (15 MB), videos (200 MB) or a PDF floor plan (25 MB)' : 'Photos up to 15 MB'} · only you, your consultant
          and Elation see them
        </p>
        <input
          type="file"
          multiple
          accept={acceptFor(purpose)}
          onChange={(e) => {
            pick(e.target.files)
            e.target.value = ''
          }}
          className="sr-only"
        />
      </label>

      {uploading.length > 0 && (
        <ul className="space-y-2">
          {uploading.map((u) => (
            <li key={u.localId} className="bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
              <span className="text-text min-w-0 flex-1 truncate">{u.name}</span>
              {u.status === 'uploading' ? (
                <span className="bg-border/20 h-1.5 w-24 overflow-hidden rounded-full" aria-label={`Uploading ${Math.round(u.progress * 100)}%`}>
                  <span className="bg-accent block h-full transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </span>
              ) : (
                <span className="text-danger">{u.error}</span>
              )}
              {u.status === 'failed' && (
                <button type="button" onClick={() => retry(u.localId)} className="text-accent font-semibold hover:underline">
                  Retry
                </button>
              )}
              {u.status === 'failed' && (
                <button type="button" onClick={() => dismiss(u.localId)} className="hover:text-danger" aria-label={`Dismiss ${u.name}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((entry) => {
            const f = byId.get(entry)
            const label = f?.filename ?? (UUID.test(entry) ? 'File' : entry)
            return (
              <li key={entry} className="bg-surface-2 text-muted relative flex items-center gap-2 overflow-hidden rounded-xl text-xs">
                {f?.thumbUrl ? (
                  <img src={f.thumbUrl} alt={label} className="h-16 w-16 object-cover" />
                ) : (
                  <span className="flex h-16 w-12 items-center justify-center">
                    <FileText className="h-4 w-4" />
                  </span>
                )}
                <span className="max-w-[10rem] truncate pr-1">{label}</span>
                <button
                  type="button"
                  onClick={() => removeEntry(entry)}
                  className="hover:text-danger mr-2 transition"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ColourField({ eventId, question }: Props) {
  const value = useValue(eventId, question.id) as { desc?: string; hex?: string[] } | undefined
  const set = useQuestionnaire((s) => s.setAnswer)
  const setPart = (patch: Partial<{ desc: string; hex: string[] }>) =>
    set(eventId, question.id, { ...(value ?? {}), ...patch })

  const suggestions = [
    { hex: '#E3BFB9', name: 'Blush' },
    { hex: '#9AB1AE', name: 'Sage' },
    { hex: '#E1CBAD', name: 'Beige' },
    { hex: '#CFAE96', name: 'Tan' },
    { hex: '#3B3A3F', name: 'Ink' },
    { hex: '#FAF3EF', name: 'Cream' },
  ]
  const active = value?.hex ?? []

  return (
    <div className="space-y-4">
      <Textarea
        value={value?.desc ?? ''}
        onChange={(e) => setPart({ desc: e.target.value })}
        rows={2}
        placeholder="e.g. soft blush + sage green with gold accents"
      />
      <div>
        <p className="text-muted/70 mb-2 text-[10px] font-bold uppercase tracking-widest">
          Tap swatches to add them
        </p>
        <div className="flex flex-wrap gap-2.5">
          {suggestions.map(({ hex, name }) => {
            const on = active.includes(hex)
            return (
              <button
                key={hex}
                type="button"
                onClick={() =>
                  setPart({
                    hex: on ? active.filter((h) => h !== hex) : [...active, hex],
                  })
                }
                className={cn(
                  'group relative flex flex-col items-center gap-1 transition',
                  on && 'scale-105',
                )}
                aria-pressed={on}
                aria-label={`${name} (${hex})`}
              >
                <span
                  className={cn(
                    'ring-border/10 h-10 w-10 rounded-full ring-2 transition',
                    on && 'ring-4 ring-accent',
                  )}
                  style={{ background: hex }}
                />
                <span className={cn('text-[10px] transition', on ? 'text-accent font-semibold' : 'text-muted/70')}>
                  {name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------- Main renderer ----------------

export function QuestionField({ eventId, question }: Props) {
  const decides = useDecides(eventId, question.id)
  const disabled = decides
  const value = useValue(eventId, question.id)
  const isAnswered = value != null && value !== '' && !(Array.isArray(value) && value.length === 0)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'group relative rounded-3xl border bg-surface p-6 transition',
        isAnswered || decides
          ? 'border-accent/25 shadow-card'
          : 'border-border/10 shadow-soft',
      )}
    >
      {/* Answered pip */}
      {(isAnswered || decides) && (
        <span className="absolute -left-1.5 top-6 h-6 w-1 rounded-r-full bg-accent" aria-hidden />
      )}

      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-text text-lg leading-tight tracking-tight">
            {question.label}
            {question.required && <span className="text-accent ml-1">*</span>}
          </h3>
          {question.help && <p className="text-muted mt-1.5 text-xs leading-relaxed">{question.help}</p>}
        </div>
        {question.elationDecides && (
          <ElationDecidesChip eventId={eventId} qid={question.id} />
        )}
      </div>

      <div className={cn('transition', disabled && 'pointer-events-none opacity-40')}>
        {question.kind === 'single' && <ChipGrid eventId={eventId} q={question} multi={false} />}
        {question.kind === 'multi' && <ChipGrid eventId={eventId} q={question} multi />}
        {question.kind === 'range-select' && <ChipGrid eventId={eventId} q={question} multi={false} />}
        {question.kind === 'text' && <TextField eventId={eventId} question={question} />}
        {question.kind === 'textarea' && <TextareaField eventId={eventId} question={question} />}
        {question.kind === 'number' && <NumberField eventId={eventId} question={question} />}
        {question.kind === 'date' && <DateField eventId={eventId} question={question} />}
        {question.kind === 'dimensions' && <DimensionsField eventId={eventId} question={question} />}
        {question.kind === 'upload' && <UploadField eventId={eventId} question={question} />}
        {question.kind === 'color' && <ColourField eventId={eventId} question={question} />}
      </div>

      {decides && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-accent/10 px-3 py-2">
          <Sparkles className="text-accent h-3.5 w-3.5" />
          <p className="text-accent text-xs font-semibold">
            Elation will curate this — you can take it back any time.
          </p>
        </div>
      )}
    </motion.div>
  )
}
