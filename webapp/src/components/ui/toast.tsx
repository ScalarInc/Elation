import { Toaster as SonnerToaster } from 'sonner'
import { useTheme } from '@/lib/theme'

export function Toaster() {
  const { theme } = useTheme()
  return (
    <SonnerToaster
      position="top-right"
      theme={theme}
      toastOptions={{
        style: {
          background: 'rgb(var(--surface))',
          color: 'rgb(var(--text))',
          border: '1px solid rgb(var(--border) / 0.1)',
          borderRadius: '12px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      }}
    />
  )
}

export { toast } from 'sonner'
