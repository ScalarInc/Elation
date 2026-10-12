import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { EVENT_TYPES, VENUE_SETTINGS } from '@elation/shared/domain'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { useCreateEvent } from '@/data/events'
import { useQuestionnaire } from '@/questionnaire/store'

const schema = z.object({
  type: z.enum(EVENT_TYPES),
  concept: z.string().trim().min(2, 'Give this event a name'),
  date: z.string().min(1, 'Pick a date'),
  guests: z.coerce.number().int().min(1, 'At least one guest'),
  venueName: z.string().trim().min(2, 'Venue name required'),
  city: z.string().trim().min(2, 'City required'),
  venueSetting: z.enum(VENUE_SETTINGS),
  // Optional: blank = "not set yet"; the questionnaire's budget question can fill it later.
  budget: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v.replace(/,/g, '')), 'Numbers only, e.g. 2500000'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

const selectClass =
  'border-border/15 bg-surface text-text focus:border-accent flex h-11 w-full rounded-xl border px-4 text-sm outline-none transition'

export function NewEventDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useCreateEvent()
  const seedQuestionnaire = useQuestionnaire((s) => s.seedEventIfEmpty)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Mehndi', guests: 200, city: 'Islamabad', venueSetting: 'Indoor', budget: '' },
  })

  async function onSubmit(values: FormOutput) {
    try {
      const event = await create.mutateAsync({
        type: values.type,
        concept: values.concept,
        date: values.date,
        guests: values.guests,
        venueName: values.venueName,
        city: values.city,
        venueSetting: values.venueSetting,
        budgetPkr: values.budget === '' ? null : Number(values.budget.replace(/,/g, '')),
      })
      // The server already answered the questionnaire basics; mirror them in the
      // local questionnaire store until Step 5 moves the questionnaire to the API.
      seedQuestionnaire(event.id, {
        q1_type: event.type,
        q2_name: event.concept,
        q3_date: event.date,
        q4_guests: event.guests,
        q5_venue: event.venue.name,
        q6_indoor: event.venue.indoor,
      })
      toast.success(`${event.concept ?? event.name} created`, {
        description: 'Start with the questionnaire to shape your concept.',
      })
      reset()
      setOpen(false)
      navigate(`/events/${event.id}/questionnaire`)
    } catch (err) {
      toast.error('Could not create the event', { description: (err as Error).message })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="md">
          <Plus className="h-4 w-4" />
          New Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Create a new event
            <Sparkles className="text-accent h-4 w-4" />
          </DialogTitle>
          <DialogDescription>
            The basics — you can flesh out every detail in the questionnaire next.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 pt-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="concept">Concept name</Label>
            <Input id="concept" placeholder="e.g. Whispers of Noor" {...register('concept')} />
            {errors.concept && <p className="text-xs text-red-500">{errors.concept.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Event type</Label>
            <select id="type" className={selectClass} {...register('type')}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Event date</Label>
            <Input id="date" type="date" {...register('date')} />
            {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venueName">Venue name</Label>
            <Input id="venueName" placeholder="Serena Ballroom" {...register('venueName')} />
            {errors.venueName && <p className="text-xs text-red-500">{errors.venueName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" placeholder="Islamabad" {...register('city')} />
            {errors.city && <p className="text-xs text-red-500">{errors.city.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venueSetting">Indoor or outdoor?</Label>
            <select id="venueSetting" className={selectClass} {...register('venueSetting')}>
              {VENUE_SETTINGS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="guests">Guest count</Label>
            <Input id="guests" type="number" min={1} {...register('guests')} />
            {errors.guests && <p className="text-xs text-red-500">{errors.guests.message}</p>}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="budget">Décor budget (PKR, optional)</Label>
            <Input id="budget" inputMode="numeric" placeholder="e.g. 2500000" {...register('budget')} />
            {errors.budget ? (
              <p className="text-xs text-red-500">{errors.budget.message}</p>
            ) : (
              <p className="text-muted/70 text-[11px]">Not sure yet? Leave it blank — Elation will help you set one.</p>
            )}
          </div>

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create event'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
