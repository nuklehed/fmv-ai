import type { Request, Response, NextFunction } from 'express'

export class AppError extends Error {
  statusCode: number
  code?: number

  constructor(message: string, statusCode = 500, code?: number) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

/**
 * Express error-handling middleware.
 * All route errors propagate here (no try/catch needed in handlers).
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Internal server error'

  // Log with context
  console.error(`[Error ${statusCode}] ${_req.method} ${_req.path} — ${message}`, err)

  res.status(statusCode).json({ error: message })
}

/**
 * Request validation middleware.
 * Validates required fields and returns 400 with structured errors.
 */
export function validateBody(...requiredFields: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const missing = requiredFields.filter(f => {
      const val = req.body[f]
      return val === undefined || val === null || (typeof val === 'string' && val.trim() === '')
    })

    if (missing.length > 0) {
      next(new AppError(`Missing required fields: ${missing.join(', ')}`, 400))
      return
    }

    next()
  }
}
