<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const email = ref('')
const password = ref('')
const error = ref('')
const isEmailNotVerified = ref(false)
const router = useRouter()
const authStore = useAuthStore()

async function handleLogin() {
  error.value = ''
  isEmailNotVerified.value = false

  try {
    await authStore.login(email.value, password.value)
    // Redirect to home page after successful login
    router.push('/')
  } catch (err) {
    if (err instanceof Error && err.message === 'email_not_verified') {
      isEmailNotVerified.value = true
      error.value = 'Your email address has not been verified. Please contact your administrator.'
    } else {
      error.value = 'Login failed. Please check your credentials and try again.'
    }
  }
}

// Redirect if already authenticated, otherwise focus email field
import { onMounted } from 'vue'
onMounted(() => {
  if (authStore.isAuthenticated && authStore.user) {
    router.push('/')
  } else {
    document.querySelector<HTMLInputElement>('input[type="email"]')?.focus()
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <!-- Logo/Brand -->
      <div class="text-center">
        <div class="mx-auto h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900">FMV AI Platform</h2>
        <p class="mt-2 text-sm text-gray-600">Fair Market Value Assessment System</p>
      </div>

      <!-- Login Form -->
      <form class="mt-8 space-y-6" @submit.prevent="handleLogin" :disabled="authStore.isLoading">
        <div class="rounded-md shadow-sm -space-y-px">
          <div>
            <label for="email-address" class="sr-only">Email address</label>
            <input
              id="email-address"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              :disabled="authStore.isLoading"
              class="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Email address"
            />
          </div>
          <div>
            <label for="password-address" class="sr-only">Password</label>
            <input
              id="password-address"
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              :disabled="authStore.isLoading"
              class="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Password"
            />
          </div>
        </div>

        <!-- Error Messages -->
        <div v-if="isEmailNotVerified" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex">
            <svg class="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <div class="ml-3">
              <p class="text-sm text-yellow-700">{{ error }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex">
            <svg class="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <div class="ml-3">
              <p class="text-sm text-red-700">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="authStore.isLoading" class="flex items-center justify-center py-2">
          <svg class="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="ml-2 text-sm text-gray-600">Signing in...</span>
        </div>

        <!-- Submit Button -->
        <div v-else>
          <button
            type="submit"
            class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Sign in
          </button>
        </div>
      </form>

      <!-- Footer Info -->
      <div class="text-center">
        <p class="mt-4 text-xs text-gray-500">
          Standalone mode — SSO/SAML available for enterprise deployments
        </p>
        <p class="mt-1 text-xs text-gray-400">
          © 2026 FMV AI Platform. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</template>
