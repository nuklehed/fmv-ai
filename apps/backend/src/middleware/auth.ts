import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface AuthenticatedRequest extends Request {
  userId?: string
  userRole?: 'BU' | 'ADMIN' | 'SA'
  tenantId?: string
}

// JWT configuration — must match auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

/**
 * Extracts and verifies the JWT token from the Authorization header.
 * Populates req.userId, req.userRole, and req.tenantId from decoded claims.
 */
export async function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    _res.status(401).json({ error: 'Authentication required' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string
      email: string
      role: 'BU' | 'ADMIN' | 'SA'
      tenantId: string
    }

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      select: { id: true, role: true, tenantId: true }
    })

    if (!user) {
      _res.status(401).json({ error: 'User not found or inactive' })
      return
    }

    req.userId = user.id
    req.userRole = user.role
    req.tenantId = user.tenantId
  } catch (err) {
    _res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

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
 * Ensures the authenticated user has BU, Admin, or SA role (any authenticated user).
 */
export function requireBUOrHigher(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.userRole) {
    res.status(403).json({ error: 'Authentication required' })
    return
  }

  // All three roles (BU, ADMIN, SA) are allowed
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
