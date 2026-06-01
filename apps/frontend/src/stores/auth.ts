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

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const isLoading = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isSA = computed(() => user.value?.role === 'SA')
  const isAdmin = computed(() => user.value?.role === 'ADMIN' || isSA.value)
  const isBU = computed(() => user.value?.role === 'BU')

  function setUser(userData: User) {
    user.value = userData
  }

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  function clearAuth() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  return {
    user,
    token,
    isLoading,
    isAuthenticated,
    isSA,
    isAdmin,
    isBU,
    setUser,
    setToken,
    clearAuth
  }
})
