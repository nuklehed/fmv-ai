<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

interface NavItem {
  key: string
  label: string
  icon: string // PrimeIcon class name (e.g., 'pi pi-briefcase')
  roles: ('SA' | 'ADMIN')[]
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// Determine active section from current route path
// /settings/control-center → empty (notification settings)
// /settings/control-center/specialties → 'specialties', etc.
const activeSection = computed(() => {
  const pathParts = route.path.split('/settings/control-center/')
  return pathParts.length > 1 && pathParts[1] ? pathParts[1] : ''
})

const navItems: NavItem[] = [
  { key: '', label: 'Overview', icon: 'pi pi-home', roles: [] },
  { key: 'notification-settings', label: 'Notification Settings', icon: 'pi pi-bell', roles: [] },
  { key: 'specialties', label: 'Specialties', icon: 'pi pi-briefcase', roles: ['SA'] },
  { key: 'criteria-sets', label: 'Criteria Sets', icon: 'pi pi-file-check', roles: ['SA', 'ADMIN'] as const },
  { key: 'tiers', label: 'Tiers & Rates', icon: 'pi pi-star', roles: ['SA', 'ADMIN'] as const },
  { key: 'users', label: 'Users', icon: 'pi pi-users', roles: ['SA'] },
  { key: 'app-settings', label: 'Application Settings', icon: 'pi pi-sliders-h', roles: ['SA'] }
]

const visibleItems = computed(() => navItems.filter(item => {
  // Items with empty roles array are visible to all users (e.g., notification settings)
  if (item.roles.length === 0) return true
  // Otherwise, check against the user's role
  const userRole = authStore.user?.role ?? ''
  return item.roles.includes(userRole as 'SA' | 'ADMIN')
}))

function navigateToSection(sectionKey: string): void {
  if (!sectionKey) {
    router.push('/settings')
  } else {
    router.push(`/settings/${sectionKey}`)
  }
}
</script>

<template>
  <div class="flex min-h-screen bg-gray-50">
    <!-- GitHub-style narrow sidebar -->
    <aside class="w-64 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
      <div class="p-4">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Settings</h3>
        <nav class="space-y-0.5">
          <button v-for="item in visibleItems" :key="item.key" @click="navigateToSection(item.key)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors',
              activeSection === item.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            ]">
            <i :class="[item.icon, 'w-4 h-4']" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </div>
    </aside>

    <!-- Main content area — nested routes render here -->
    <main class="flex-1 p-8 bg-gray-50">
      <RouterView />
    </main>
  </div>
</template>
