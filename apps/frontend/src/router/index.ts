import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

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
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true }
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
  // Public route — no auth required
  if (to.name === 'login') return true

  // Check for existing token
  const accessToken = localStorage.getItem('accessToken')
  if (!accessToken) {
    return { name: 'login' }
  }

  // TODO: Full role-based guards will be implemented in issue #5
  // For now, we verify the token is valid by fetching user profile
  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!response.ok) {
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
