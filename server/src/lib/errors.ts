/**
 * Business error with a stable `code` the frontend can switch on.
 * Thrown from services; turned into `{ error: { code, message, details } }`
 * by the errors plugin.
 */
export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: unknown

  constructor(code: string, statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown }
}
