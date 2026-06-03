<script setup lang="ts">
import { ref, computed } from 'vue'

type Variation = 'github-style' | 'wider-panel' | 'compact-tabs'

interface NavItem {
  key: string
  label: string
  icon: string // PrimeIcon class name (e.g., 'pi pi-hospital')
  roles: ('SA' | 'ADMIN')[]
}

const activeVariation = ref<Variation>('github-style')
const activeSection = ref<string>('notification-settings')
const currentUserRole = ref<'BU' | 'ADMIN' | 'SA'>('SA')

function setRole(role: 'BU' | 'ADMIN' | 'SA') {
  currentUserRole.value = role
  const firstVisible = visibleItems.value
  if (firstVisible.length > 0) {
    activeSection.value = firstVisible[0].key
  }
}

const navItems: NavItem[] = [
  { key: 'specialties', label: 'Specialties', icon: 'pi pi-hospital', roles: ['SA'] },
  { key: 'criteria-sets', label: 'Criteria Sets', icon: 'pi pi-list-check', roles: ['SA', 'ADMIN'] as const },
  { key: 'tiers', label: 'Tiers & Rates', icon: 'pi pi-star', roles: ['SA', 'ADMIN'] as const },
  { key: 'users', label: 'Users', icon: 'pi pi-users', roles: ['SA'] },
  { key: 'app-settings', label: 'Application Settings', icon: 'pi pi-sliders-h', roles: ['SA'] },
  { key: 'notification-settings', label: 'Notification Settings', icon: 'pi pi-bell', roles: [] }
]

const visibleItems = computed(() => navItems.filter(item => item.roles.length === 0 || (currentUserRole.value !== 'BU' && item.roles.includes(currentUserRole.value))))

const sectionContent: Record<string, { title: string; description: string }> = {
  'specialties': { title: 'Specialties Management', description: 'Manage medical specialties and their descriptions.' },
  'criteria-sets': { title: 'Criteria Sets Management', description: 'Define evaluation criteria, questions, and answer options for assessments.' },
  'tiers': { title: 'Tiers & Rates Management', description: 'Configure tier levels, score ranges, and rate bounds for approved assessments.' },
  'users': { title: 'User Management', description: 'Manage system users, their roles, and account status.' },
  'app-settings': { title: 'Application Settings', description: 'Configure system-wide settings that affect all tenants.' },
  'notification-settings': { title: 'Notification Settings', description: 'Control how and when you receive notifications.' }
}

const sectionStats: Record<string, { label: string; value: string }[]> = {
  'specialties': [
    { label: 'Total Specialties', value: '12' },
    { label: 'Active', value: '10' },
    { label: 'Inactive', value: '2' }
  ],
  'criteria-sets': [
    { label: 'Total Criteria Sets', value: '5' },
    { label: 'Active', value: '4' },
    { label: 'Questions (total)', value: '38' }
  ],
  'tiers': [
    { label: 'Total Tiers', value: '15' },
    { label: 'Specialties Covered', value: '4' },
    { label: 'Rate Range', value: '$80 – $350/hr' }
  ],
  'users': [
    { label: 'Total Users', value: '24' },
    { label: 'Business Users', value: '18' },
    { label: 'Admins', value: '3' },
    { label: 'System Admins', value: '3' }
  ],
  'app-settings': [
    { label: 'Approval Validity Period', value: '730 days (2 years)' },
    { label: 'Expiry Reminder Lead Time', value: '30 days' },
    { label: 'System Notification Status', value: 'Active for all users' }
  ],
  'notification-settings': [
    { label: 'In-App Notifications', value: 'Enabled' },
    { label: 'Email Notifications', value: 'Enabled' }
  ]
}

const currentSection = computed(() => sectionContent[activeSection.value] || { title: '', description: '' })
const currentStats = computed(() => sectionStats[activeSection.value] || [])
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Prototype controls bar (not in production) -->
    <div class="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div class="flex items-center gap-4">
        <span class="text-xs font-mono bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">PROTOTYPE</span>
        <span class="text-sm text-gray-300">Settings Control Center — choose a variation:</span>
      </div>
      <div class="flex items-center gap-2 flex-wrap justify-end">
        <!-- Role switcher -->
        <span class="text-xs text-gray-400 mr-1">Role:</span>
        <button v-for="role in ['BU', 'ADMIN', 'SA'] as const" :key="role" @click="setRole(role)"
          :class="[
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            currentUserRole === role ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          ]">
          {{ role }}
        </button>

        <span class="text-gray-600 mx-2 hidden sm:inline">|</span>

        <!-- Variation switcher -->
        <button v-for="v in [
          { key: 'github-style', label: 'GitHub Sidebar' },
          { key: 'wider-panel', label: 'Wider Panel' },
          { key: 'compact-tabs', label: 'Compact Tabs' }
        ]" :key="v.key" @click="activeVariation = v.key as Variation"
          :class="[
            'px-3 py-1.5 rounded text-xs font-medium transition-colors',
            activeVariation === v.key ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
          ]">
          {{ v.label }}
        </button>
      </div>
    </div>

    <!-- Variation 1: GitHub-style narrow sidebar -->
    <div v-if="activeVariation === 'github-style'" class="flex min-h-[calc(100vh-3.5rem)]">
      <aside class="w-64 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
        <div class="p-4">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Settings</h3>
          <nav class="space-y-0.5">
            <button v-for="item in visibleItems" :key="item.key" @click="activeSection = item.key"
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

      <main class="flex-1 p-8 bg-gray-50">
        <!-- Content -->
        <div class="max-w-3xl">
          <h2 class="text-2xl font-bold text-gray-900 mb-1">{{ currentSection.title }}</h2>
          <p class="text-sm text-gray-500 mb-6">{{ currentSection.description }}</p>

          <!-- Stats cards -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div v-for="stat in currentStats" :key="stat.label" class="bg-white rounded-lg border border-gray-200 p-4">
              <p class="text-xs text-gray-500 mb-1">{{ stat.label }}</p>
              <p class="text-lg font-semibold text-gray-900">{{ stat.value }}</p>
            </div>
          </div>

          <!-- Mock content area -->
          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h3 class="text-sm font-medium text-gray-900 mb-4">Content Area</h3>
            <p class="text-sm text-gray-500 mb-4">
              This is where the actual {{ currentSection.title.toLowerCase() }} content would live.
              The current implementation has separate pages for each section; this prototype
              shows how they could be unified under a single control center layout.
            </p>

            <!-- Mock table -->
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="i in 3" :key="i">
                    <td class="px-4 py-3 text-sm text-gray-900">Sample item {{ i }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                    </td>
                    <td class="px-4 py-3 text-right text-sm">
                      <button class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                      <button class="text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-4 flex justify-end">
              <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">+ Add New</button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Variation 2: Wider panel with grouped sections -->
    <div v-if="activeVariation === 'wider-panel'" class="flex min-h-[calc(100vh-3.5rem)]">
      <aside class="w-80 border-r border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
        <div class="p-5">
          <h3 class="text-sm font-bold text-gray-900 mb-1">Control Center</h3>
          <p class="text-xs text-gray-500 mb-4">{{ currentUserRole }} view</p>

          <!-- System settings group -->
          <div v-if="visibleItems.some(i => i.roles.length > 0)" class="mb-4">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">System Settings</h4>
            <nav class="space-y-1">
              <button v-for="item in visibleItems.filter(i => i.roles.length > 0)" :key="item.key" @click="activeSection = item.key"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all',
                  activeSection === item.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                ]">
                <i :class="[item.icon, 'w-4 h-4']" />
                <span>{{ item.label }}</span>
                <svg v-if="activeSection === item.key" class="ml-auto w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </nav>
          </div>

          <!-- Divider -->
          <hr v-if="visibleItems.some(i => i.roles.length > 0) && visibleItems.some(i => i.roles.length === 0)" class="border-gray-100 mb-4" />

          <!-- Personal settings group -->
          <div v-if="visibleItems.some(i => i.roles.length === 0)">
            <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Personal</h4>
            <nav class="space-y-1">
              <button v-for="item in visibleItems.filter(i => i.roles.length === 0)" :key="item.key" @click="activeSection = item.key"
                :class="[
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all',
                  activeSection === item.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-50'
                ]">
                <i :class="[item.icon, 'w-4 h-4']" />
                <span>{{ item.label }}</span>
                <svg v-if="activeSection === item.key" class="ml-auto w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </aside>

      <main class="flex-1 p-8 bg-gray-50">
        <!-- Same content area -->
        <div class="max-w-3xl">
          <h2 class="text-2xl font-bold text-gray-900 mb-1">{{ currentSection.title }}</h2>
          <p class="text-sm text-gray-500 mb-6">{{ currentSection.description }}</p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div v-for="stat in currentStats" :key="stat.label" class="bg-white rounded-lg border border-gray-200 p-4">
              <p class="text-xs text-gray-500 mb-1">{{ stat.label }}</p>
              <p class="text-lg font-semibold text-gray-900">{{ stat.value }}</p>
            </div>
          </div>

          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h3 class="text-sm font-medium text-gray-900 mb-4">Content Area</h3>
            <p class="text-sm text-gray-500 mb-4">
              This is where the actual {{ currentSection.title.toLowerCase() }} content would live.
            </p>

            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="i in 3" :key="i">
                    <td class="px-4 py-3 text-sm text-gray-900">Sample item {{ i }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                    </td>
                    <td class="px-4 py-3 text-right text-sm">
                      <button class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                      <button class="text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-4 flex justify-end">
              <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">+ Add New</button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Variation 3: Compact top tabs -->
    <div v-if="activeVariation === 'compact-tabs'" class="min-h-[calc(100vh-3.5rem)] bg-gray-50">
      <div class="bg-white border-b border-gray-200 px-6 sticky top-0 z-40">
        <nav class="flex space-x-1 overflow-x-auto py-1">
          <button v-for="item in visibleItems" :key="item.key" @click="activeSection = item.key"
            :class="[
              'flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap',
              activeSection === item.key ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            ]">
            <i :class="[item.icon, 'w-4 h-4']" />
            <span>{{ item.label }}</span>
          </button>
        </nav>
      </div>

      <main class="p-8">
        <!-- Same content area -->
        <div class="max-w-3xl">
          <h2 class="text-2xl font-bold text-gray-900 mb-1">{{ currentSection.title }}</h2>
          <p class="text-sm text-gray-500 mb-6">{{ currentSection.description }}</p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            <div v-for="stat in currentStats" :key="stat.label" class="bg-white rounded-lg border border-gray-200 p-4">
              <p class="text-xs text-gray-500 mb-1">{{ stat.label }}</p>
              <p class="text-lg font-semibold text-gray-900">{{ stat.value }}</p>
            </div>
          </div>

          <div class="bg-white rounded-lg border border-gray-200 p-6">
            <h3 class="text-sm font-medium text-gray-900 mb-4">Content Area</h3>
            <p class="text-sm text-gray-500 mb-4">
              This is where the actual {{ currentSection.title.toLowerCase() }} content would live.
            </p>

            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="i in 3" :key="i">
                    <td class="px-4 py-3 text-sm text-gray-900">Sample item {{ i }}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
                    </td>
                    <td class="px-4 py-3 text-right text-sm">
                      <button class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                      <button class="text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-4 flex justify-end">
              <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">+ Add New</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
