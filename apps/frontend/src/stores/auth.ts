import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface User {
  id: string
  email: string
  role: 'BU' | 'ADMIN' | 'SA'
  tenantId: string
  isActive: boolean
  emailVerified: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem('accessToken'))
  const refreshToken = ref<string | null>(localStorage.getItem('refreshToken'))
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!accessToken.value)
  const isSA = computed(() => user.value?.role === 'SA')
  const isAdmin = computed(() => user.value?.role === 'ADMIN' || isSA.value)
  const isBU = computed(() => user.value?.role === 'BU')

  function setUser(userData: User) {
    user.value = userData
    localStorage.setItem('userRole', userData.role)
    localStorage.setItem('authUser', JSON.stringify(userData))
  }

  // Restore persisted user from localStorage on store creation
  const savedUser = localStorage.getItem('authUser')
  if (savedUser) {
    try {
      setUser(JSON.parse(savedUser))
    } catch {}
  }

  function setTokens(newAccessToken: string, newRefreshToken: string) {
    accessToken.value = newAccessToken
    refreshToken.value = newRefreshToken
    localStorage.setItem('accessToken', newAccessToken)
    localStorage.setItem('refreshToken', newRefreshToken)
  }

  async function refreshAccessToken() {
    if (!refreshToken.value) return false

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken.value })
      })

      if (!response.ok) throw new Error('Token refresh failed')

      const data = await response.json()
      setTokens(data.accessToken, refreshToken.value!)
      return true
    } catch (error) {
      console.error('Token refresh error:', error)
      clearAuth()
      return false
    }
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('authUser')
  }

  async function login(email: string, password: string) {
    isLoading.value = true
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Login failed')
      }

      const data = await response.json()
      setTokens(data.accessToken, data.refreshToken)
      setUser(data.user)
      return { requiresVerification: false }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Email not verified')) {
        throw new Error('email_not_verified')
      }
      throw error
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken.value}` }
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      clearAuth()
    }
  }

  async function fetchUserProfile() {
    if (!accessToken.value) return null

    try {
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${accessToken.value}` }
      })

      if (!response.ok) {
        // Try to refresh token first
        const refreshed = await refreshAccessToken()
        if (!refreshed) return null

        const retryResponse = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken.value}` }
        })

        if (!retryResponse.ok) return null
        const data = await retryResponse.json()
        setUser(data)
        return data
      }

      const data = await response.json()
      setUser(data)
      return data
    } catch (error) {
      console.error('Fetch profile error:', error)
      // Try token refresh as fallback
      const refreshed = await refreshAccessToken()
      if (!refreshed) return null

      try {
        const retryResponse = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${accessToken.value}` }
        })
        if (!retryResponse.ok) return null
        const data = await retryResponse.json()
        setUser(data)
        return data
      } catch (err) {
        clearAuth()
        return null
      }
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!accessToken.value) throw new Error('Not authenticated')

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken.value}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to change password')
    }

    return response.json()
  }

  return {
    user,
    accessToken,
    refreshToken,
    isLoading,
    isAuthenticated,
    isSA,
    isAdmin,
    isBU,
    setUser,
    setTokens,
    refreshAccessToken,
    clearAuth,
    login,
    logout,
    fetchUserProfile,
    changePassword
  }
})
