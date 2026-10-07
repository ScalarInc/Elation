import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/20 bg-surface/60 p-12 text-center',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="bg-accent/15 text-accent mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          {icon}
        </div>
      )}
      <h3 className="font-display text-text text-xl">{title}</h3>
      {description && <p className="text-muted mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
