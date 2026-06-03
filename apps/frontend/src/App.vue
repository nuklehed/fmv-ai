<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

// Notification state
const unreadCount = ref(0)
let notificationInterval: ReturnType<typeof setInterval> | null = null

async function fetchUnreadCount() {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    
    const response = await fetch('/api/notifications/unread-count', {
      headers: { Authorization: `Bearer ${token}` }
    })
    
    if (response.ok) {
      const data = await response.json()
      unreadCount.value = data.unreadCount ?? 0
    }
  } catch (error) {
    console.error('Error fetching notification count:', error)
  }
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

onMounted(() => {
  fetchUnreadCount()
  // Poll for unread notifications every minute
  notificationInterval = setInterval(fetchUnreadCount, 60000)
})

onUnmounted(() => {
  if (notificationInterval) clearInterval(notificationInterval)
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Top Navigation Bar -->
    <nav v-if="authStore.isAuthenticated" class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <!-- Left side -->
          <div class="flex items-center space-x-8">
            <router-link to="/" class="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors">
              FMV AI Platform
            </router-link>

            <!-- Navigation Links (role-based) -->
            <div class="hidden md:flex items-center space-x-1">
              <router-link to="/" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                Dashboard
              </router-link>

              <!-- All authenticated users: Assessments -->
              <router-link to="/assessments" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                Assessments
              </router-link>

              <!-- SA-only links -->
              <template v-if="authStore.isSA">
                <router-link to="/settings" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  App Settings
                </router-link>
                <router-link to="/specialties" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  Specialties
                </router-link>
                <router-link to="/tiers" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  Tiers
                </router-link>
                <router-link to="/users" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  User Management
                </router-link>
              </template>

              <!-- Admin/SA links -->
              <template v-if="authStore.isAdmin">
                <router-link to="/criteria-sets" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  Criteria Sets
                </router-link>
              </template>

              <!-- All users: Settings -->
              <router-link to="/settings" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                Settings
              </router-link>
            </div>
          </div>

          <!-- Right side -->
          <div class="flex items-center space-x-4">
            <!-- Notification Bell -->
            <button
              @click="fetchUnreadCount()"
              class="relative p-2 text-gray-500 hover:text-blue-600 transition-colors"
              title="Notifications"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span v-if="unreadCount > 0" class="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {{ unreadCount > 9 ? '9+' : unreadCount }}
              </span>
            </button>

            <!-- User info -->
            <div v-if="authStore.user" class="hidden sm:flex items-center space-x-2">
              <span class="text-sm text-gray-700">{{ authStore.user.email }}</span>
              <span :class="[
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                authStore.isSA ? 'bg-red-100 text-red-800' :
                authStore.isAdmin ? 'bg-purple-100 text-purple-800' :
                'bg-blue-100 text-blue-800'
              ]">
                {{ authStore.user.role }}
              </span>
            </div>

            <!-- Logout button -->
            <button
              @click="handleLogout"
              class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span class="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- Page Content -->
    <RouterView />
  </div>
</template>
