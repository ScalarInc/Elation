import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Sparkles } from 'lucide-react'
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
import type { EventType } from '@/types'

const EVENT_TYPES: EventType[] = [
  'Mehndi', 'Mayoun', 'Baraat', 'Walima', 'Nikkah', 'Engagement',
  'Birthday', 'Corporate Event', 'Milad', 'Qawwali', 'Dinner',
  'Bridal Shower', 'Baby Shower', 'Anniversary', 'Other',
]

const schema = z.object({
  type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
  concept: z.string().min(2, 'Give this event a name'),
  date: z.string().min(1, 'Pick a date'),
  guests: z.coerce.number().int().min(1, 'At least one guest'),
  venueName: z.string().min(2, 'Venue name required'),
  city: z.string().min(2, 'City required'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

export function NewEventDialog() {
  const [open, setOpen] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { type: EVENT_TYPES[0] },
  })

  function onSubmit(_values: FormOutput) {
    // TODO(backend): create the event via the API, then close the dialog and open the new event.
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
            <select
              id="type"
              className="border-border/15 bg-surface text-text focus:border-accent flex h-11 w-full rounded-xl border px-4 text-sm outline-none transition"
              {...register('type')}
            >
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

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="guests">Guest count</Label>
            <Input id="guests" type="number" min={1} {...register('guests')} />
            {errors.guests && <p className="text-xs text-red-500">{errors.guests.message}</p>}
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
