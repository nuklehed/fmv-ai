/**
 * Application configuration — loaded from environment variables.
 * Validates required variables at import time to fail fast.
 */

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}
export const JWT_SECRET = jwtSecret

export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d'
export const JWT_REFRESH_EXPIRES_IN: string = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

export const PORT = process.env.PORT || '3000'

export const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://localhost:11434'
export const LLM_MODEL = process.env.LLM_MODEL || 'qwen3.6-35b-a3b'

export const AUTH_MODE = process.env.AUTH_MODE || 'standalone'
