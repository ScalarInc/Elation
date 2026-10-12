import { supabase } from '@/lib/supabase'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '')

/** Error thrown for any non-2xx API response, carrying the backend's `{ error: { code, message } }`. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; auth?: boolean }

/** Call the backend. Adds the signed-in user's access token unless `auth: false`. */
export async function apiRequest<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const { data } = await supabase.auth.getSession()
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection.')
  }

  if (response.status === 204 || response.status === 202) return undefined as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error
    throw new ApiRequestError(response.status, error?.code ?? 'HTTP_ERROR', error?.message ?? 'Request failed.')
  }
  return payload as T
}
