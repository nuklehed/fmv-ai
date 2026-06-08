import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAdminRouter } from './saRouter'

const router = createAdminRouter()
const prisma = new PrismaClient()

/**
 * GET /api/tiers
 * List tiers with pagination, optional active filter and criteriaSet filter
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const activeOnly = req.query.active === 'true'
    const criteriaSetId = req.query.criteriaSetId as string | undefined

    const where: Record<string, unknown> = { tenantId: req.tenantId!, isActive: true }
    if (!activeOnly) {
      // When not filtering to active only, remove the default filter
      delete (where as any).isActive
    }
    if (criteriaSetId) {
      where.criteriaSetId = criteriaSetId
    }

    // Fetch total count for pagination
    const totalCount = await prisma.tier.count({ where })

    const tiers = await prisma.tier.findMany({
      where,
      include: {
        criteriaSet: { select: { id: true, name: true } }
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
        criteriaSet: { select: { id: true, name: true } }
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
    const { name, minScore, maxScore, criteriaSetId, lowRate, highRate, defaultPercentile } = req.body

    if (!name || minScore === undefined || maxScore === undefined || !criteriaSetId || lowRate === undefined || highRate === undefined) {
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

    // Verify criteriaSet belongs to tenant
    const criteriaSet = await prisma.criteriaSet.findFirst({
      where: { id: criteriaSetId, tenantId: req.tenantId! }
    })

    if (!criteriaSet) {
      res.status(404).json({ error: 'Criteria set not found in your organization' })
      return
    }

    const tier = await prisma.tier.create({
      data: {
        name,
        minScore,
        maxScore,
        criteriaSetId,
        lowRate: String(lowRate),
        highRate: String(highRate),
        defaultPercentile: defaultPercentile || 50,
        tenantId: req.tenantId!
      },
      include: {
        criteriaSet: { select: { id: true, name: true } }
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
    const { name, minScore, maxScore, criteriaSetId, lowRate, highRate, defaultPercentile, isActive } = req.body

    // Verify tier belongs to tenant
    const existingTier = await prisma.tier.findFirst({
      where: { id, tenantId: req.tenantId! }
    })

    if (!existingTier) {
      res.status(404).json({ error: 'Tier not found' })
      return
    }

    // Verify criteriaSet if provided
    let criteriaSetIdToUse = (existingTier as any).criteriaSetId
    if (criteriaSetId) {
      const cs = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId: req.tenantId! }
      })

      if (!cs) {
        res.status(404).json({ error: 'Criteria set not found in your organization' })
        return
      }

      criteriaSetIdToUse = criteriaSetId
    }

    const updateData: Record<string, unknown> = {}
    
    if (name !== undefined) updateData.name = name
    if (minScore !== undefined) updateData.minScore = minScore
    if (maxScore !== undefined) updateData.maxScore = maxScore
    if (criteriaSetIdToUse !== (existingTier as any).criteriaSetId) updateData.criteriaSetId = criteriaSetIdToUse
    if (lowRate !== undefined) updateData.lowRate = String(lowRate)
    if (highRate !== undefined) updateData.highRate = String(highRate)
    if (defaultPercentile !== undefined) updateData.defaultPercentile = defaultPercentile
    if (isActive !== undefined) updateData.isActive = isActive

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

    // Verify criteriaSet if provided
    let criteriaSetIdToUse = (existingTier as any).criteriaSetId
    if (criteriaSetId) {
      const cs = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId: req.tenantId! }
      })

      if (!cs) {
        res.status(404).json({ error: 'Criteria set not found in your organization' })
        return
      }

      criteriaSetIdToUse = criteriaSetId
    }

    const updateData: Record<string, unknown> = {}
    
    if (name !== undefined) updateData.name = name
    if (minScore !== undefined) updateData.minScore = minScore
    if (maxScore !== undefined) updateData.maxScore = maxScore
    if (criteriaSetIdToUse !== (existingTier as any).criteriaSetId) updateData.criteriaSetId = criteriaSetIdToUse
    if (lowRate !== undefined) updateData.lowRate = String(lowRate)
    if (highRate !== undefined) updateData.highRate = String(highRate)
    if (defaultPercentile !== undefined) updateData.defaultPercentile = defaultPercentile
    if (isActive !== undefined) updateData.isActive = isActive

    const updatedTier = await prisma.tier.update({
      where: { id },
      data: updateData,
      include: {
        criteriaSet: { select: { id: true, name: true } }
      }
    })

    res.json(updatedTier)
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
