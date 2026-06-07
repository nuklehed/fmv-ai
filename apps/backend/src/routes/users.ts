import type { Response } from 'express'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createSaRouter } from './saRouter'

const router = createSaRouter()
const prisma = new PrismaClient()

/**
 * GET /api/users
 * List all users in the tenant (SA only)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const search = req.query.search as string | undefined

    // Multi-tenant isolation
    const where: Record<string, unknown> = { tenantId: req.tenantId! }

    if (search && typeof search === 'string' && search.length > 0) {
      where.OR = [
        { email: { contains: search.toLowerCase() } },
        { role: { equals: search.toUpperCase() as any } }
      ]
    }

    // Fetch total count for pagination
    const totalCount = await prisma.user.count({ where })

    // Fetch paginated results (exclude passwordHash from response)
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    res.json({
      data: users,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/users
 * Create a new user account (SA only)
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, role, emailVerified } = req.body

    if (!email || !role) {
      res.status(400).json({ error: 'Email and role are required' })
      return
    }

    // Validate role value
    if (!['BU', 'ADMIN', 'SA'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be BU, ADMIN, or SA' })
      return
    }

    // Multi-tenant isolation
    const tenantId = req.tenantId!

    // Check for duplicate email within the same tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        email: { equals: email.toLowerCase() },
        tenantId,
        isActive: true
      }
    })

    if (existingUser) {
      res.status(409).json({ error: `A user with the email "${email}" already exists in your organization` })
      return
    }

    // Password is required for standalone mode (not SSO)
    let passwordHash: string | null = null
    if (password) {
      passwordHash = await bcrypt.hash(password, 12)
    } else if (!process.env.AUTH_MODE || process.env.AUTH_MODE === 'standalone') {
      res.status(400).json({ error: 'Password is required in standalone mode' })
      return
    }

    // Email verification enforced by default for SA-created accounts
    const verified = emailVerified === true

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        role: role as 'BU' | 'ADMIN' | 'SA',
        tenantId,
        isActive: true,
        emailVerified: verified
      },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    res.status(201).json(user)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Email must be unique within your organization' })
      return
    }

    console.error('Error creating user:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/users/:id
 * Update a user account (SA only) — role, isActive, emailVerified
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { role, isActive, emailVerified, password } = req.body

    // Multi-tenant isolation — verify user belongs to tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true
      }
    })

    if (!existingUser) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Prevent SA from deactivating themselves (safety measure)
    if (req.userId && req.userId === id && isActive === false) {
      res.status(403).json({ error: 'You cannot deactivate your own account' })
      return
    }

    const updateData: Record<string, unknown> = {}

    // Validate role if provided
    if (role !== undefined) {
      if (!['BU', 'ADMIN', 'SA'].includes(role)) {
        res.status(400).json({ error: 'Invalid role. Must be BU, ADMIN, or SA' })
        return
      }
      updateData.role = role as 'BU' | 'ADMIN' | 'SA'
    }

    if (isActive !== undefined) updateData.isActive = isActive
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified

    // Password update — hash and store
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    res.json(user)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/users/:id
 * Deactivate a user account (SA only — soft delete via isActive=false)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation — verify user belongs to tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      }
    })

    if (!existingUser) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Prevent SA from deactivating themselves (safety measure)
    if (req.userId && req.userId === id) {
      res.status(403).json({ error: 'You cannot deactivate your own account' })
      return
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({ message: 'User deactivated', user })
  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
