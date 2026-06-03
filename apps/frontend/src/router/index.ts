import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/assessments',
    name: 'assessments',
    component: () => import('@/views/AssessmentsListView.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/assessments/new',
    name: 'assessmentNew',
    component: () => import('@/views/AssessmentFormView.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/specialties',
    name: 'specialties',
    component: () => import('@/views/SpecialtiesView.vue'),
    meta: { requiresAuth: true, requiresSA: true }
  },
  {
    path: '/criteria-sets',
    name: 'criteriaSets',
    component: () => import('@/views/CriteriaSetsView.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true }
  },
  {
    path: '/users',
    name: 'userManagement',
    component: () => import('@/views/UserManagementView.vue'),
    meta: { requiresAuth: true, requiresSA: true }
  },
  {
    path: '/tiers',
    name: 'tierManagement',
    component: () => import('@/views/TierManagementView.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true }
  },
  // ─── Settings (notification preferences) ──────────────────────────
  {
    path: '/settings',
    name: 'settingsHome',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true }
  },
  // ─── Settings Control Center (Admin/SA only, sidebar layout) ──────
  {
    path: '/settings/control-center',
    name: 'settingsControlCenter',
    component: () => import('@/views/SettingsControlCenterView.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'specialties',
        name: 'settingsSpecialties',
        component: () => import('@/views/SpecialtiesView.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      },
      {
        path: 'criteria-sets',
        name: 'settingsCriteriaSets',
        component: () => import('@/views/CriteriaSetsView.vue'),
        meta: { requiresAuth: true, requiresAdminOrSA: true }
      },
      {
        path: 'tiers',
        name: 'settingsTiers',
        component: () => import('@/views/TierManagementView.vue'),
        meta: { requiresAuth: true, requiresAdminOrSA: true }
      },
      {
        path: 'users',
        name: 'settingsUsers',
        component: () => import('@/views/UserManagementView.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      },
      {
        path: 'app-settings',
        name: 'settingsAppSettings',
        component: () => import('@/views/ApplicationSettingsView.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      }
    ]
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue')
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to, _from) => {
  const authStore = useAuthStore()

  // Public route — no auth required
  if (to.name === 'login') {
    // Already authenticated? Redirect to home instead of showing login form
    if (authStore.isAuthenticated && authStore.user) return { name: 'home' }
    return true
  }

  // Check for existing token in store or localStorage
  const accessToken = authStore.accessToken || localStorage.getItem('accessToken')
  if (!accessToken) {
    return { name: 'login' }
  }

  // Verify the token is valid by fetching user profile via auth store
  try {
    const profile = await authStore.fetchUserProfile()
    if (!profile) {
      // Token invalid — redirect to login
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      return { name: 'login' }
    }

    // Token valid — allow navigation
    return true
  } catch (error) {
    console.error('Auth check error:', error)
    return { name: 'login' }
  }
})
