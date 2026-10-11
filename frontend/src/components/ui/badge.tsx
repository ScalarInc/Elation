import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest',
  {
    variants: {
      variant: {
        default: 'bg-surface-2 text-text border border-border/10',
        accent: 'bg-accent/20 text-accent',
        sage: 'bg-sage/25 text-sage-deep dark:bg-sage/15 dark:text-sage',
        warning: 'bg-warning/20 text-warning',
        danger: 'bg-danger/15 text-danger',
        success: 'bg-success/20 text-success',
        outline: 'border border-border/20 text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  ),
)
Badge.displayName = 'Badge'
