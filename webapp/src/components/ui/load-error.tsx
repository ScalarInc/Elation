import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Inline "couldn’t load" message with a retry button, for failed queries. */
export function LoadError({
  what,
  onRetry,
  className,
}: {
  what: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div className={cn('py-10 text-center', className)}>
      <p className="text-muted text-sm">Couldn’t load {what}.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCw className="h-3.5 w-3.5" /> Try again
      </Button>
    </div>
  )
}
