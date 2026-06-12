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
          <i class="pi pi-check w-7 h-7 text-white"></i>
        </div>
        <h2 class="mt-6 text-3xl font-extrabold text-slate-900">FMV AI Platform</h2>
        <p class="mt-2 text-sm text-slate-600">Fair Market Value Assessment System</p>
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
              class="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-gray-500 text-slate-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
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
              class="appearance-none rounded-none relative block w-full px-3 py-3 border border-slate-300 placeholder-gray-500 text-slate-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
              placeholder="Password"
            />
          </div>
        </div>

        <!-- Error Messages -->
        <div v-if="isEmailNotVerified" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div class="flex">
            <i class="pi pi-exclamation-triangle h-5 w-5 text-yellow-400"></i>
            <div class="ml-3">
              <p class="text-sm text-yellow-700">{{ error }}</p>
            </div>
          </div>
        </div>

        <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex">
            <i class="pi pi-times-circle h-5 w-5 text-red-400"></i>
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
          <span class="ml-2 text-sm text-slate-600">Signing in...</span>
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
        <p class="mt-4 text-xs text-slate-500">
          Standalone mode — SSO/SAML available for enterprise deployments
        </p>
        <p class="mt-1 text-xs text-slate-400">
          © 2026 FMV AI Platform. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</template>
