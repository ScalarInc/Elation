import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold tracking-wide transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-sm hover:brightness-95 active:brightness-90',
        secondary:
          'bg-surface-2 text-text border border-border/10 hover:border-border/20',
        outline:
          'border border-border/20 bg-transparent text-text hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        link: 'text-accent underline-offset-4 hover:underline',
        destructive: 'bg-danger text-white hover:brightness-95',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-sm tracking-[0.15em]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
