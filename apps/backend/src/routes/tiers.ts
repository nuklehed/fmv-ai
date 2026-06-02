import { Router } from 'express'
import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate, requireAdminOrSA } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// All tier routes require authentication and Admin/SA role
router.use(authenticate)
router.use(requireAdminOrSA)

/**
 * GET /api/tiers
 * List tiers with pagination, optional active filter and specialty filter
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const activeOnly = req.query.active === 'true'
    const specialtyId = req.query.specialtyId as string | undefined

    const where: Record<string, unknown> = { tenantId: req.tenantId!, isActive: true }
    if (!activeOnly) {
      // When not filtering to active only, remove the default filter
      delete (where as any).isActive
    }
    if (specialtyId) {
      where.specialtyId = specialtyId
    }

    // Fetch total count for pagination
    const totalCount = await prisma.tier.count({ where })

    const tiers = await prisma.tier.findMany({
      where,
      include: {
        specialty: { select: { id: true, name: true } }
      },
      orderBy: { minScore: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    })

    res.json({
      data: tiers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching tiers:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/tiers/:id
 * Get single tier details
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const tier = await prisma.tier.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        specialty: { select: { id: true, name: true } }
      }
    })

    if (!tier) {
      res.status(404).json({ error: 'Tier not found' })
      return
    }

    res.json(tier)
  } catch (error) {
    console.error('Error fetching tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/tiers
 * Create a new tier
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, minScore, maxScore, specialtyId, lowRate, highRate, defaultPercentile } = req.body

    if (!name || minScore === undefined || maxScore === undefined || !specialtyId || lowRate === undefined || highRate === undefined) {
      res.status(400).json({ error: 'All fields are required' })
      return
    }

    // Validate score range
    if (minScore > maxScore) {
      res.status(400).json({ error: 'Min score must be less than or equal to max score' })
      return
    }

    // Validate rate range
    if (lowRate > highRate) {
      res.status(400).json({ error: 'Low rate must be less than or equal to high rate' })
      return
    }

    // Validate percentile
    if (defaultPercentile !== undefined && (defaultPercentile < 0 || defaultPercentile > 100)) {
      res.status(400).json({ error: 'Default percentile must be between 0 and 100' })
      return
    }

    // Verify specialty belongs to tenant
    const specialty = await prisma.specialty.findFirst({
      where: { id: specialtyId, tenantId: req.tenantId! }
    })

    if (!specialty) {
      res.status(404).json({ error: 'Specialty not found in your organization' })
      return
    }

    const tier = await prisma.tier.create({
      data: {
        name,
        minScore,
        maxScore,
        specialtyId,
        lowRate: String(lowRate),
        highRate: String(highRate),
        defaultPercentile: defaultPercentile || 50,
        tenantId: req.tenantId!
      },
      include: {
        specialty: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(tier)
  } catch (error) {
    console.error('Error creating tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/tiers/:id
 * Update a tier
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { name, minScore, maxScore, specialtyId, lowRate, highRate, defaultPercentile, isActive } = req.body

    // Verify tier belongs to tenant
    const existingTier = await prisma.tier.findFirst({
      where: { id, tenantId: req.tenantId! }
    })

    if (!existingTier) {
      res.status(404).json({ error: 'Tier not found' })
      return
    }

    // Validate score range if provided
    if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
      res.status(400).json({ error: 'Min score must be less than or equal to max score' })
      return
    }

    // Validate rate range if provided
    if (lowRate !== undefined && highRate !== undefined && lowRate > highRate) {
      res.status(400).json({ error: 'Low rate must be less than or equal to high rate' })
      return
    }

    // Validate percentile if provided
    if (defaultPercentile !== undefined && (defaultPercentile < 0 || defaultPercentile > 100)) {
      res.status(400).json({ error: 'Default percentile must be between 0 and 100' })
      return
    }

    // Verify specialty if provided
    let specialtyIdToUse = existingTier.specialtyId
    if (specialtyId) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: specialtyId, tenantId: req.tenantId! }
      })

      if (!specialty) {
        res.status(404).json({ error: 'Specialty not found in your organization' })
        return
      }

      specialtyIdToUse = specialtyId
    }

    const updateData: Record<string, unknown> = {}
    
    if (name !== undefined) updateData.name = name
    if (minScore !== undefined) updateData.minScore = minScore
    if (maxScore !== undefined) updateData.maxScore = maxScore
    if (specialtyIdToUse !== existingTier.specialtyId) updateData.specialtyId = specialtyIdToUse
    if (lowRate !== undefined) updateData.lowRate = String(lowRate)
    if (highRate !== undefined) updateData.highRate = String(highRate)
    if (defaultPercentile !== undefined) updateData.defaultPercentile = defaultPercentile
    if (isActive !== undefined) updateData.isActive = isActive

    const tier = await prisma.tier.update({
      where: { id },
      data: updateData,
      include: {
        specialty: { select: { id: true, name: true } }
      }
    })

    res.json(tier)
  } catch (error) {
    console.error('Error updating tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/tiers/:id
 * Soft-delete a tier by setting isActive=false
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Verify tier belongs to tenant and is active
    const existingTier = await prisma.tier.findFirst({
      where: { id, tenantId: req.tenantId!, isActive: true }
    })

    if (!existingTier) {
      res.status(404).json({ error: 'Tier not found' })
      return
    }

    // Soft-delete by setting isActive=false (preserves FK integrity with assessments)
    await prisma.tier.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({ message: 'Tier deleted successfully' })
  } catch (error) {
    console.error('Error deleting tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
