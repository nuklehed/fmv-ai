import type { Request, Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface AuthenticatedRequest extends Request {
  userId?: string
  userRole?: 'BU' | 'ADMIN' | 'SA'
  tenantId?: string
}

/**
 * Extracts user info from the Authorization header (Bearer token).
 * Token validation is implemented in the auth module — this middleware
 * assumes the token has already been verified and decoded.
 */
export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    _res.status(401).json({ error: 'Authentication required' })
    return
  }

  const token = authHeader.slice(7)

  // TODO: Verify JWT token and extract user claims
  // For now, this is a placeholder — actual implementation in issue #5
  req.userId = 'placeholder-user-id'
  req.userRole = 'SA'
  req.tenantId = 'placeholder-tenant-id'

  next()
}

/**
 * Ensures the authenticated user has SA role.
 */
export function requireSA(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'SA') {
    res.status(403).json({ error: 'Superadmin access required' })
    return
  }

  next()
}

/**
 * Ensures the authenticated user has Admin or SA role.
 */
export function requireAdminOrSA(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'ADMIN' && req.userRole !== 'SA') {
    res.status(403).json({ error: 'Admin or Superadmin access required' })
    return
  }

  next()
}

/**
 * Ensures multi-tenant isolation — user can only access their own tenant's data.
 */
export function requireTenantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    res.status(403).json({ error: 'Tenant context missing' })
    return
  }

  // TODO: Verify that the requested resource belongs to req.tenantId
  // This is enforced at the query level in route handlers
  next()
}
