<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
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

              <!-- SA-only links -->
              <template v-if="authStore.isSA">
                <router-link to="/specialties" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                  Specialties
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

              <!-- Settings (placeholder) -->
              <a href="#" class="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors">
                Settings
              </a>
            </div>
          </div>

          <!-- Right side -->
          <div class="flex items-center space-x-4">
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
