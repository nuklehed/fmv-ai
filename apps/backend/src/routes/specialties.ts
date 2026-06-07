import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createSaRouter } from './saRouter'

const router = createSaRouter()
const prisma = new PrismaClient()

/**
 * GET /api/specialties
 * List specialties (active by default, filter for all)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { active = 'true', search } = req.query

    const where: Record<string, unknown> = {}

    // Multi-tenant isolation
    if (req.tenantId) {
      where.tenantId = req.tenantId
    }

    // Filter by active status
    if (active === 'false') {
      where.isActive = false
    } else {
      where.isActive = true
    }

    // Search by name or description
    if (search && typeof search === 'string' && search.length > 0) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } }
      ]
    }

    const specialties = await prisma.specialty.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        criteriaSetId: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        criteriaSet: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    res.json(specialties)
  } catch (error) {
    console.error('Error fetching specialties:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/specialties
 * Create a new specialty (SA only)
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, description, criteriaSetId } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Specialty name is required' })
      return
    }

    // Multi-tenant isolation — use tenant from authenticated user
    const tenantId = req.tenantId!

    // Validate criteriaSetId if provided — must exist and belong to same tenant
    if (criteriaSetId) {
      const criteriaSet = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId, isActive: true }
      })
      if (!criteriaSet) {
        res.status(400).json({ error: 'Invalid criteria set. Must be active and belong to your organization.' })
        return
      }
    }

    // Check for duplicate name within the same tenant
    const existing = await prisma.specialty.findFirst({
      where: {
        name: { equals: name.trim() },
        tenantId,
        isActive: true
      }
    })

    if (existing) {
      res.status(409).json({ error: `A specialty with the name "${name}" already exists in your organization` })
      return
    }

    const specialty = await prisma.specialty.create({
      data: {
        name: name.trim(),
        description: description || null,
        criteriaSetId: criteriaSetId || null,
        tenantId
      },
      select: {
        id: true,
        name: true,
        description: true,
        criteriaSetId: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        criteriaSet: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    res.status(201).json(specialty)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Specialty name must be unique within your organization' })
      return
    }

    console.error('Error creating specialty:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/specialties/:id
 * Update a specialty (SA only)
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { name, description, criteriaSetId, isActive } = req.body

    // Multi-tenant isolation — verify specialty belongs to user's tenant
    const existing = await prisma.specialty.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'Specialty not found' })
      return
    }

    // Validate criteriaSetId if provided — must exist and belong to same tenant
    if (criteriaSetId) {
      const criteriaSet = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId: req.tenantId!, isActive: true }
      })
      if (!criteriaSet) {
        res.status(400).json({ error: 'Invalid criteria set. Must be active and belong to your organization.' })
        return
      }
    }

    // Cannot activate a specialty without a linked criteria set
    const shouldActivate = isActive === true || (isActive !== false && !('isActive' in req.body))
    if (shouldActivate && existing.criteriaSetId !== criteriaSetId) {
      res.status(400).json({ error: 'Cannot activate specialty without linking a criteria set. Assign a criteria set first.' })
      return
    }

    // Check for duplicate name (excluding current specialty)
    if (name && typeof name === 'string') {
      const duplicate = await prisma.specialty.findFirst({
        where: {
          id: { not: id },
          name: { equals: name.trim() },
          tenantId: req.tenantId!,
          isActive: true
        }
      })

      if (duplicate) {
        res.status(409).json({ error: `A specialty with the name "${name}" already exists in your organization` })
        return
      }
    }

    const specialty = await prisma.specialty.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(criteriaSetId !== undefined && { criteriaSetId: criteriaSetId || null }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        name: true,
        description: true,
        criteriaSetId: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        criteriaSet: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    res.json(specialty)
  } catch (error) {
    console.error('Error updating specialty:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/specialties/:id
 * Soft-delete a specialty by setting isActive=false (SA only)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation — verify specialty belongs to user's tenant
    const existing = await prisma.specialty.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'Specialty not found' })
      return
    }

    const specialty = await prisma.specialty.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true
      }
    })

    res.json({ message: 'Specialty deactivated', specialty })
  } catch (error) {
    console.error('Error deleting specialty:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
