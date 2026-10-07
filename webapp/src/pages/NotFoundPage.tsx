import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="bg-bg text-text flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted/60">404</p>
        <h1 className="font-display mt-2 text-4xl text-text">This page slipped away.</h1>
        <p className="mt-3 text-sm text-muted/70">
          The page you're looking for doesn't exist — perhaps it's still being
          curated by Elation.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
