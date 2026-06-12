<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ApplicationSetting } from '@/types'

// Default values for known settings
const defaultValues: Record<string, unknown> = {
  approvalValidityPeriod: 730,       // 2 years in days
  expiryReminderLeadTime: 30         // 30 days
}

const settings = ref<ApplicationSetting[]>([])
const loading = ref(false)
const formError = ref('')
const savingKey = ref<string | null>(null)

// Reactive variables for editable settings (v-model requires member expressions, not function calls)
const approvalValidityPeriod = ref<number>(defaultValues.approvalValidityPeriod as number)
const expiryReminderLeadTime = ref<number>(defaultValues.expiryReminderLeadTime as number)
const defaultTierPercentile = ref<number>(50)
const roundTierRateToNearest5 = ref<boolean>(true)
const numberOfTiers = ref<number>(3)

async function fetchSettings() {
  loading.value = true
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/application-settings', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to fetch settings: ${response.statusText}`)

    const fetchedSettings = await response.json()
    settings.value = fetchedSettings

    // Populate reactive variables from fetched settings or defaults
    fetchedSettings.forEach((s: ApplicationSetting) => {
      if (s.key === 'approvalValidityPeriod') approvalValidityPeriod.value = Number(s.value ?? defaultValues.approvalValidityPeriod)
      if (s.key === 'expiryReminderLeadTime') expiryReminderLeadTime.value = Number(s.value ?? defaultValues.expiryReminderLeadTime)
      if (s.key === 'defaultTierPercentile') defaultTierPercentile.value = Number(s.value ?? 50)
      if (s.key === 'roundTierRateToNearest5') roundTierRateToNearest5.value = Boolean(JSON.parse(String(s.value ?? 'true')))
    })

    // Fetch tier config separately
    const tierResponse = await fetch('/api/tier-config', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (tierResponse.ok) {
      const tierConfig = await tierResponse.json()
      numberOfTiers.value = tierConfig.numberOfTiers ?? 3
    }
  } catch (error) {
    console.error('Error fetching application settings:', error)
    formError.value = 'Failed to load application settings'
  } finally {
    loading.value = false
  }
}

function getSettingDescription(key: string): string | undefined {
  const setting = settings.value.find(s => s.key === key)
  if (setting?.description) return setting.description
  
  // Provide helpful descriptions for known settings
  const descriptions: Record<string, string> = {
    approvalValidityPeriod: 'Default validity period for approved assessments in days (default: 730 = 2 years)',
    expiryReminderLeadTime: 'Number of days before renewal date to send expiry reminders (default: 30)'
  }
  return descriptions[key]
}

async function handleSave(key: string) {
  savingKey.value = key
  formError.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    // Use reactive variables directly (v-model bound values)
    let value: unknown
    if (key === 'approvalValidityPeriod') {
      value = approvalValidityPeriod.value
    } else if (key === 'expiryReminderLeadTime') {
      value = expiryReminderLeadTime.value
    } else if (key === 'defaultTierPercentile') {
      value = defaultTierPercentile.value
    } else if (key === 'roundTierRateToNearest5') {
      value = roundTierRateToNearest5.value as unknown
    }

    const response = await fetch(`/api/application-settings/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ value })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update setting')
    }

    await fetchSettings()
  } catch (error) {
    console.error(`Error updating ${key}:`, error)
    formError.value = error instanceof Error ? error.message : `Failed to update ${key}`
  } finally {
    savingKey.value = null
  }
}

async function handleSaveNumberOfTiers() {
  savingKey.value = 'numberOfTiers'
  formError.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/tier-config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ numberOfTiers: numberOfTiers.value })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update number of tiers')
    }

    await fetchSettings()
  } catch (error) {
    console.error('Error updating number of tiers:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to update number of tiers'
  } finally {
    savingKey.value = null
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-slate-900 mb-1">Application Settings</h2>
        <p class="text-sm text-slate-600">Configure system-wide settings for the FMV AI platform</p>
      </div>

      <!-- Error Message -->
      <div v-if="formError" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-slate-500">Loading settings...</p>
      </div>

      <!-- Settings List -->
      <div v-else class="space-y-4">
        <!-- Approval Validity Period -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-slate-900">Approval Validity Period</h3>
              <p class="text-sm text-slate-500 mt-1">{{ getSettingDescription('approvalValidityPeriod') }}</p>
            </div>
          </div>
          <div class="mt-4 flex items-center space-x-3">
            <input
              v-model.number="approvalValidityPeriod"
              type="number"
              :disabled="savingKey === 'approvalValidityPeriod'"
              @blur="handleSave('approvalValidityPeriod')"
              class="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-500">days</span>
            <button
              @click="handleSave('approvalValidityPeriod')"
              :disabled="savingKey === 'approvalValidityPeriod'"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {{ savingKey === 'approvalValidityPeriod' ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <!-- Expiry Reminder Lead Time -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-slate-900">Expiry Reminder Lead Time</h3>
              <p class="text-sm text-slate-500 mt-1">{{ getSettingDescription('expiryReminderLeadTime') }}</p>
            </div>
          </div>
          <div class="mt-4 flex items-center space-x-3">
            <input
              v-model.number="expiryReminderLeadTime"
              type="number"
              :disabled="savingKey === 'expiryReminderLeadTime'"
              @blur="handleSave('expiryReminderLeadTime')"
              class="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-500">days</span>
            <button
              @click="handleSave('expiryReminderLeadTime')"
              :disabled="savingKey === 'expiryReminderLeadTime'"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {{ savingKey === 'expiryReminderLeadTime' ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <!-- Default Tier Percentile -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-slate-900">Default Tier Percentile</h3>
              <p class="text-sm text-slate-500 mt-1">Business decision for rate calculation when approving assessments. Used to interpolate a rate between lowRate and highRate (default: 50th percentile).</p>
            </div>
          </div>
          <div class="mt-4 flex items-center space-x-3">
            <input
              v-model.number="defaultTierPercentile"
              type="number"
              min="0"
              max="100"
              :disabled="savingKey === 'defaultTierPercentile'"
              @blur="handleSave('defaultTierPercentile')"
              class="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-500">percentile</span>
            <button
              @click="handleSave('defaultTierPercentile')"
              :disabled="savingKey === 'defaultTierPercentile'"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {{ savingKey === 'defaultTierPercentile' ? 'Saving...' : 'Save' }}
            </button>
          </div>

          <!-- Rounding checkbox -->
          <div class="mt-4 flex items-center space-x-3">
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                v-model="roundTierRateToNearest5"
                :disabled="savingKey === 'roundTierRateToNearest5'"
                @change="handleSave('roundTierRateToNearest5')"
                class="sr-only peer"
              />
              <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <span class="text-sm text-slate-700">Round resulting rate to nearest $5 increment</span>
          </div>
        </div>

        <!-- Number of Tiers -->
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-base font-medium text-slate-900">Number of Tiers</h3>
              <p class="text-sm text-slate-500 mt-1">How many tier levels to use for assessment scoring (e.g., 3 = Gold/Silver/Bronze). Each criteria set will have this many tiers with contiguous score ranges.</p>
            </div>
          </div>
          <div class="mt-4 flex items-center space-x-3">
            <input
              v-model.number="numberOfTiers"
              type="number"
              min="1"
              max="20"
              :disabled="savingKey === 'numberOfTiers'"
              @blur="handleSaveNumberOfTiers()"
              class="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-slate-500">tiers</span>
            <button
              @click="handleSaveNumberOfTiers()"
              :disabled="savingKey === 'numberOfTiers'"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {{ savingKey === 'numberOfTiers' ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>

        <!-- Notification Preferences (System-wide) -->
        <div class="bg-white shadow rounded-lg p-6">
          <h3 class="text-base font-medium text-slate-900">Notification Channels</h3>
          <p class="text-sm text-slate-500 mt-1">Default notification channels for all users. Users can override these in their personal settings.</p>
          <div class="mt-4 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-700">In-app notifications</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked disabled class="sr-only peer" />
                <div class="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-700">Email notifications</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" disabled class="sr-only peer" />
                <div class="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Card -->
      <div class="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div class="flex">
          <i class="pi pi-info-circle h-5 w-5 text-blue-400 mt-0.5"></i>
          <div class="ml-3">
            <p class="text-sm text-blue-700">
              Settings are saved automatically when you click "Save". Changes take effect immediately for new assessments.
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
