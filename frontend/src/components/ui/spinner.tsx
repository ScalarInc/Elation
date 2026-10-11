import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-6 w-6' } as const

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <span className={cn('inline-flex', className)} {...props}>
      <Loader2 className={cn('animate-spin text-accent', sizes[size])} />
    </span>
  )
}
