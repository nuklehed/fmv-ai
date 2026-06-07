/**
 * API client with automatic token refresh and error handling.
 */

interface ApiResponse<T = unknown> {
  data?: T
  pagination?: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
  error?: string
}

async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const accessToken = localStorage.getItem('accessToken')

  const headersInit: HeadersInit = {
    'Content-Type': 'application/json',
    ...Object.fromEntries(
      Object.entries(options.headers as Record<string, string> || {}).filter(([, v]) => v !== undefined)
    )
  }

  if (accessToken) {
    headersInit['Authorization'] = `Bearer ${accessToken}`
  }

  let response = await fetch(url, {
    ...options,
    headers: headersInit
  })

  // If 401, try to refresh token and retry once
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      try {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        })

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          localStorage.setItem('accessToken', data.accessToken)

          // Retry original request with new token
          response = await fetch(url, {
            ...options,
            headers: { ...headersInit, Authorization: `Bearer ${data.accessToken}` }
          })
        } else {
          // Refresh failed — clear auth and redirect to login
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          window.location.href = '/login'
          return { error: 'Session expired. Please log in again.' }
        }
      } catch (error) {
        console.error('Token refresh failed:', error)
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/login'
        return { error: 'Authentication error. Please log in again.' }
      }
    } else {
      // No refresh token — clear auth and redirect to login
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
      return { error: 'Session expired. Please log in again.' }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: response.statusText }))
    return { error: errorData.error || `HTTP ${response.status}: ${response.statusText}` }
  }

  return response.json() as Promise<ApiResponse<T>>
}

export const api = {
  get: <T>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(url: string, body?: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' })
}
