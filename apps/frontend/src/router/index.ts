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
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue')
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const isAuthenticated = !!localStorage.getItem('token')
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'login' })
    return
  }

  // TODO: Add role-based route guards once authentication is implemented (issue #5)
  // For now, all authenticated users can access admin pages
  next()
})
