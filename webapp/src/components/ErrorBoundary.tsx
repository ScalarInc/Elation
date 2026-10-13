import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence: a crash in one page shows a calm "something went wrong"
 * with a reload, instead of a blank screen (docs/step-13-frontend-integration.md).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Name only in production: messages can echo server data.
    if (import.meta.env.PROD) console.error('Page crashed:', error.name)
    else console.error('Page crashed', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating elsewhere gives the next page a fresh start.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="bg-bg text-text flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-2xl">Something went wrong on this page</p>
        <p className="text-muted max-w-md text-sm">Reload to carry on — anything you hadn’t saved yet may need re-entering. If it keeps happening, message your consultant.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-accent text-accent-fg rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Reload
        </button>
      </div>
    )
  }
}
