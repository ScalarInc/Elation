import * as React from 'react'
import { cn } from '@/lib/utils'

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-3xl border border-border/10 bg-surface shadow-card',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-6 pb-3', className)} {...props} />
)

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('font-display text-xl text-text', className)} {...props} />
)

export const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-xs text-muted/70', className)} {...props} />
)

export const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6 pt-0', className)} {...props} />
)

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />
)
