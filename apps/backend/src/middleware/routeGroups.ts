import { Router } from 'express'
import { authenticate, requireSA, requireAdminOrSA, requireBUOrHigher } from '../middleware/auth'

// Re-export for route-level middleware overrides
export { requireAdminOrSA, requireBUOrHigher, authenticate }

/** Factory for creating SA-only authenticated route groups */
export function createSaRouter(): ReturnType<typeof Router> {
  const router = Router()
  router.use(authenticate)
  router.use(requireSA)
  return router
}

/** Factory for creating Admin+SA authenticated route groups */
export function createAdminRouter(): ReturnType<typeof Router> {
  const router = Router()
  router.use(authenticate)
  router.use(requireAdminOrSA)
  return router
}

/** Factory for creating basic authenticated route groups */
export function createAuthedRouter(): ReturnType<typeof Router> {
  const router = Router()
  router.use(authenticate)
  return router
}

/** Factory for BU+ authenticated route groups (BU, Admin, SA) */
export function createBuRouter(): ReturnType<typeof Router> {
  const router = Router()
  router.use(authenticate)
  router.use(requireBUOrHigher)
  return router
}
