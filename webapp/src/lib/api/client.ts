/**
 * Thin fetch wrapper for the Elation X API (docs/step-13-frontend-integration.md).
 * Same-origin: Vite proxies /api in dev; the server serves the webapp in production,
 * so the session cookie flows automatically.
 */

export const API_BASE = '/api/v1'

/** `mock` keeps the app runnable without the server (frontend-only work). */
export const API_MODE: 'http' | 'mock' = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const isApiError = (err: unknown, code?: string): err is ApiError =>
  err instanceof ApiError && (code === undefined || err.code === code)

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function apiFetch<T>(path: string, { method = 'GET', body, signal, headers }: Options = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK', 'Can’t reach Elation right now — check your connection and try again.')
  }

  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Something went wrong', e?.details)
  }
  return data as T
}
