/** Shared API helpers for frontend views — auth headers + fetch with error handling */

/** Build auth headers for API requests */
export function getAuthHeaders(contentType = 'application/json'): Record<string, string> {
  const token = localStorage.getItem('accessToken')
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType !== 'multipart/form-data' && { 'Content-Type': contentType })
  }
}

/** Fetch with auth headers and error handling. Returns Response for manual .json() calls. */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(url, options)
  if (!response.ok) {
    let message: string
    try {
      const errorData = await response.json()
      message = errorData.error || `Request failed: ${response.statusText}`
    } catch {
      message = `Request failed: ${response.statusText}`
    }
    throw new Error(message)
  }
  return response
}
