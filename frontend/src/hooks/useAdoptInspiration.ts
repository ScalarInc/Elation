import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { toast } from '@/components/ui/toast'

/** Adopt an inspiration into an event, then open that event's moodboard. */
export function useAdoptInspiration() {
  const navigate = useNavigate()
  const [adopting, setAdopting] = useState(false)

  async function adopt(slug: string, eventId: string, name: string) {
    setAdopting(true)
    try {
      const result = await api.inspirations.adopt(slug, eventId)
      toast.success(`${name} adopted`, {
        description: result.budgetDrafted
          ? 'Added to your moodboards and used to draft your budget.'
          : 'Added to your moodboards. Your existing budget was left as is.',
      })
      navigate(`/events/${eventId}?tab=moodboard`)
    } catch (err) {
      toast.error("Couldn't adopt this concept", { description: (err as Error).message })
    } finally {
      setAdopting(false)
    }
  }

  return { adopt, adopting }
}
