import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/dashboard/Home.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/assessments',
    name: 'assessments',
    component: () => import('@/views/assessment/AssessmentList.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/assessments/new',
    name: 'assessmentNew',
    component: () => import('@/views/assessment/AssessmentForm.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/assessments/edit/:id',
    name: 'assessmentEdit',
    component: () => import('@/views/assessment/AssessmentForm.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/assessments/:id/review',
    name: 'assessmentReview',
    component: () => import('@/views/assessment/AssessmentReview.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true }
  },
  {
    path: '/specialties',
    name: 'specialties',
    component: () => import('@/views/settings/Specialties.vue'),
    meta: { requiresAuth: true, requiresSA: true }
  },
  {
    path: '/criteria-sets',
    name: 'criteriaSets',
    component: () => import('@/views/settings/CriteriaSets.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true }
  },
  {
    path: '/users',
    name: 'userManagement',
    component: () => import('@/views/settings/UserManagement.vue'),
    meta: { requiresAuth: true, requiresSA: true }
  },
  {
    path: '/tiers',
    name: 'tierManagement',
    component: () => import('@/views/settings/TierRates.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true }
  },
  // ─── Settings (notification settings for all users) ───────────────
  {
    path: '/settings',
    name: 'settingsHome',
    component: () => import('@/views/settings/NotificationSettings.vue'),
    meta: { requiresAuth: true }
  },
  // ─── Settings Control Center (Admin/SA only, sidebar layout) ──────
  {
    path: '/settings/control-center',
    name: 'settingsControlCenter',
    component: () => import('@/views/settings/SettingsDashboard.vue'),
    meta: { requiresAuth: true, requiresAdminOrSA: true },
    children: [
      {
        path: '',
        redirect: { name: 'settingsNotifications' }
      },
      {
        path: 'notifications',
        name: 'settingsNotifications',
        component: () => import('@/views/settings/NotificationSettings.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: 'specialties',
        name: 'settingsSpecialties',
        component: () => import('@/views/settings/Specialties.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      },
      {
        path: 'criteria-sets',
        name: 'settingsCriteriaSets',
        component: () => import('@/views/settings/CriteriaSets.vue'),
        meta: { requiresAuth: true, requiresAdminOrSA: true }
      },
      {
        path: 'tiers',
        name: 'settingsTiers',
        component: () => import('@/views/settings/TierRates.vue'),
        meta: { requiresAuth: true, requiresAdminOrSA: true }
      },
      {
        path: 'users',
        name: 'settingsUsers',
        component: () => import('@/views/settings/UserManagement.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      },
      {
        path: 'application-settings',
        name: 'settingsAppSettings',
        component: () => import('@/views/settings/ApplicationSettings.vue'),
        meta: { requiresAuth: true, requiresSA: true }
      }
    ]
  },
  // ─── HCP Profile (BU or higher) ──────────────────────────────
  {
    path: '/hcp/:id/profile',
    name: 'hcpProfile',
    component: () => import('@/views/hcp/HcpProfile.vue'),
    meta: { requiresAuth: true, requiresBUOrHigher: true }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/Login.vue')
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

    // Token valid — enforce role-based access control
    const userRole = profile.role
    const requiresBUOrHigher = to.meta.requiresBUOrHigher === true
    const requiresAdminOrSA = to.meta.requiresAdminOrSA === true
    const requiresSA = to.meta.requiresSA === true

    if (requiresSA && userRole !== 'SA') {
      return { name: 'home' }
    }
    if (requiresAdminOrSA && !['ADMIN', 'SA'].includes(userRole)) {
      return { name: 'home' }
    }
    if (requiresBUOrHigher && !['BU', 'ADMIN', 'SA'].includes(userRole)) {
      return { name: 'home' }
    }

    return true
  } catch (error) {
    console.error('Auth check error:', error)
    return { name: 'login' }
  }
})
