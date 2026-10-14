import { Spinner } from '@/components/ui/spinner'

/** Centered spinner for a page whose main data is still loading. */
export function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={fullScreen ? 'bg-bg flex min-h-screen items-center justify-center' : 'flex justify-center px-10 py-24'}>
      <Spinner size="lg" />
    </div>
  )
}
