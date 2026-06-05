<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const formError = ref('')
const successMessage = ref('')

// Notification preferences
const inAppEnabled = ref(true)
const emailEnabled = ref(true)

async function fetchSettings() {
  loading.value = true
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/userSettings/me/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to fetch settings: ${response.statusText}`)

    const data = await response.json()
    inAppEnabled.value = data.inApp !== false
    emailEnabled.value = data.email !== false
  } catch (error) {
    console.error('Error fetching user settings:', error)
    formError.value = 'Failed to load notification preferences'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  formError.value = ''
  successMessage.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/userSettings/me/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        inApp: inAppEnabled.value,
        email: emailEnabled.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to save settings')
    }

    successMessage.value = 'Settings saved successfully'
  } catch (error) {
    console.error('Error saving settings:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

function isAdminOrSA(): boolean {
  const role = localStorage.getItem('userRole')
  return role === 'ADMIN' || role === 'SA'
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-1">Notification Settings</h2>
        <p class="text-sm text-gray-600">Manage how and when you receive notifications</p>
      </div>

      <!-- Messages -->
      <div v-if="successMessage" class="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-sm text-green-600">{{ successMessage }}</p>
      </div>
      <div v-if="formError && !loading" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading settings...</p>
      </div>

      <!-- Settings Form -->
      <form v-else @submit.prevent="saveSettings" class="space-y-6">
        <!-- In-app Notifications -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-gray-900">In-app Notifications</h3>
              <p class="text-sm text-gray-500 mt-1">Receive notifications within the app when assessments are approved, rejected, or approaching expiry.</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="inAppEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <!-- Email Notifications -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-gray-900">Email Notifications</h3>
              <p class="text-sm text-gray-500 mt-1">Receive email notifications for assessment approvals, rejections, and expiry reminders.</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="emailEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <!-- Save Button -->
        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="saving"
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
          >
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>
      </form>

      <!-- Switch to Control Center (Admin/SA only) -->
      <div v-if="isAdminOrSA()" class="mt-4">
        <router-link
          to="/settings/control-center"
          class="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Switch to Control Center →
        </router-link>
      </div>

      <!-- Info Card -->
      <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex">
          <svg class="h-5 w-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
          <div class="ml-3">
            <p class="text-sm text-blue-700">
              Notifications are active by default. You can toggle them on or off at any time. Changes take effect immediately.
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
