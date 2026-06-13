<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

interface NavItem {
  key: string
  label: string
  icon: string
  roles: ('SA' | 'ADMIN')[]
}

const router = useRouter()
const authStore = useAuthStore()

const navItems: NavItem[] = [
  { key: '/settings/control-center/application-settings', label: 'Application', icon: 'pi pi-sliders-h', roles: ['SA'] },
  { key: '/settings/control-center/notifications', label: 'Notifications', icon: 'pi pi-bell', roles: [] },
  { key: '/settings/control-center/criteria-sets', label: 'Criteria Sets', icon: 'pi pi-book', roles: ['SA', 'ADMIN'] as const },
  { key: '/settings/control-center/specialties', label: 'Specialties', icon: 'pi pi-briefcase', roles: ['SA'] },
  { key: '/settings/control-center/tiers', label: 'Tier Rates', icon: 'pi pi-star', roles: ['SA', 'ADMIN'] as const },
  { key: '/settings/control-center/users', label: 'Users', icon: 'pi pi-users', roles: ['SA'] }
]

const visibleItems = computed(() => navItems.filter(item => {
  if (item.roles.length === 0) return true
  const userRole = authStore.user?.role ?? ''
  return item.roles.includes(userRole as 'SA' | 'ADMIN')
}))

function navigateTo(key: string): void {
  router.push(key)
}
</script>

<template>
  <div class="flex min-h-screen bg-slate-50">
    <!-- GitHub-style narrow sidebar -->
    <aside class="w-64 border-r border-slate-200 bg-white flex-shrink-0 overflow-y-auto">
      <div class="p-4">
        <h3 class="text-xs font-semibold text-slate-500 mb-3">Settings</h3>
        <nav class="space-y-0.5">
          <button v-for="item in visibleItems" :key="item.key" @click="navigateTo(item.key)"
            :class="[
              'w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors',
              $route.path === item.key ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            ]">
            <i :class="[item.icon, 'w-4 h-4']" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </div>
    </aside>

    <!-- Main content area — nested routes render here -->
    <main class="flex-1 p-8 bg-slate-50">
      <RouterView />
    </main>
  </div>
</template>
