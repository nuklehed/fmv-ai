import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAdminRouter } from './saRouter'

const router = createAdminRouter()
const prisma = new PrismaClient()

/** Compute total possible score for a criteria set (sum of all answer scores) */
async function getTotalPossibleScore(csId: string): Promise<number> {
  const questions = await prisma.question.findMany({
    where: { criteriaSetId: csId, isActive: true },
    select: { answers: { where: { isActive: true }, select: { score: true } } }
  })
  let total = 0
  for (const q of questions) {
    for (const a of q.answers) {
      total += a.score
    }
  }
  return total
}

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
      delete (where as any).isActive
    }
    if (criteriaSetId) {
      where.criteriaSetId = criteriaSetId
    }

    const totalCount = await prisma.tier.count({ where })

    // Sort by maxScore descending (highest tier first)
    const tiers = await prisma.tier.findMany({
      where,
      include: {
        criteriaSet: { select: { id: true, name: true } }
      },
      orderBy: { maxScore: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })

    res.json({
      data: tiers,
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
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
      where: { id, tenantId: req.tenantId! },
      include: { criteriaSet: { select: { id: true, name: true } } }
    })

    if (!tier) { res.status(404).json({ error: 'Tier not found' }); return }
    res.json(tier)
  } catch (error) {
    console.error('Error fetching tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/tiers
 * Create a new tier — SA enters only maxScore; minScore is auto-calculated
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, maxScore, criteriaSetId, lowRate, highRate, defaultPercentile } = req.body

    if (!name || maxScore === undefined || !criteriaSetId || lowRate === undefined || highRate === undefined) {
      res.status(400).json({ error: 'All fields are required' })
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

    // Fetch existing active tiers for this criteria set (highest first)
    const existingTiers = await prisma.tier.findMany({
      where: { criteriaSetId, tenantId: req.tenantId!, isActive: true },
      orderBy: { maxScore: 'desc' }
    })

    // Auto-calculate minScore from next higher tier's maxScore + 1
    let calculatedMin = 1
    const nextHigherTier = existingTiers.find(t => t.maxScore >= maxScore)
    if (nextHigherTier) {
      calculatedMin = nextHigherTier.maxScore + 1
    }

    // Validate no overlap: maxScore must be ≥ minScore
    if (maxScore < calculatedMin) {
      res.status(400).json({ error: 'Max score must be greater than or equal to minimum score.' })
      return
    }

    // Validate contiguous range: if there's a higher tier, new tier starts right after it
    if (nextHigherTier && calculatedMin !== nextHigherTier.maxScore + 1) {
      res.status(400).json({
        error: `Tiers must form contiguous ranges. This tier starts at ${calculatedMin} but should start at ${nextHigherTier.maxScore + 1} (previous tier ends at ${nextHigherTier.maxScore}).`
      })
      return
    }

    // Validate last-tier constraint: highest max across all tiers must equal total possible score
    const newMax = Math.max(maxScore, ...existingTiers.map(t => t.maxScore))
    const totalPossibleScore = await getTotalPossibleScore(criteriaSetId)
    if (newMax !== totalPossibleScore && totalPossibleScore > 0) {
      res.status(400).json({
        error: `The highest tier max-score must equal the total possible score (${totalPossibleScore}). Current highest is ${newMax}.`
      })
      return
    }

    const tier = await prisma.tier.create({
      data: {
        name,
        minScore: calculatedMin,
        maxScore,
        criteriaSetId,
        lowRate: String(lowRate),
        highRate: String(highRate),
        defaultPercentile: defaultPercentile || 50,
        tenantId: req.tenantId!
      },
      include: { criteriaSet: { select: { id: true, name: true } } }
    })

    res.status(201).json(tier)
  } catch (error) {
    console.error('Error creating tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/tiers/:id
 * Update a tier — SA enters only maxScore; minScore is auto-calculated
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { name, maxScore, criteriaSetId, lowRate, highRate, defaultPercentile, isActive } = req.body

    // Verify tier belongs to tenant
    const existingTier = await prisma.tier.findFirst({
      where: { id, tenantId: req.tenantId! }
    })
    if (!existingTier) { res.status(404).json({ error: 'Tier not found' }); return }

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
    let criteriaSetIdToUse = existingTier.criteriaSetId as string
    if (criteriaSetId && criteriaSetId !== criteriaSetIdToUse) {
      const cs = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId: req.tenantId! }
      })
      if (!cs) { res.status(404).json({ error: 'Criteria set not found in your organization' }); return }
      criteriaSetIdToUse = criteriaSetId
    }

    // Auto-calculate minScore only if maxScore changed or was provided
    let calculatedMin = (existingTier as any).minScore
    if (maxScore !== undefined) {
      const existingTiers = await prisma.tier.findMany({
        where: { criteriaSetId: criteriaSetIdToUse, tenantId: req.tenantId!, isActive: true },
        orderBy: { maxScore: 'desc' }
      })

      // Exclude the current tier from comparison if it's still active
      const otherTiers = existingTiers.filter(t => t.id !== id)
      const nextHigherTier = otherTiers.find(t => t.maxScore >= maxScore)

      calculatedMin = 1
      if (nextHigherTier) {
        calculatedMin = nextHigherTier.maxScore + 1
      }

      // Validate no overlap
      if (maxScore < calculatedMin) {
        res.status(400).json({ error: 'Max score must be greater than or equal to minimum score.' })
        return
      }

      // Validate contiguous range
      if (nextHigherTier && calculatedMin !== nextHigherTier.maxScore + 1) {
        res.status(400).json({
          error: `Tiers must form contiguous ranges. This tier starts at ${calculatedMin} but should start at ${nextHigherTier.maxScore + 1} (previous tier ends at ${nextHigherTier.maxScore}).`
        })
        return
      }

      // Validate last-tier constraint
      const newMax = Math.max(maxScore, ...otherTiers.map(t => t.maxScore))
      const totalPossibleScore = await getTotalPossibleScore(criteriaSetIdToUse)
      if (newMax !== totalPossibleScore && totalPossibleScore > 0) {
        res.status(400).json({
          error: `The highest tier max-score must equal the total possible score (${totalPossibleScore}). Current highest is ${newMax}.`
        })
        return
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (maxScore !== undefined) updateData.maxScore = maxScore
    updateData.minScore = calculatedMin
    if (criteriaSetIdToUse !== existingTier.criteriaSetId) updateData.criteriaSetId = criteriaSetIdToUse
    if (lowRate !== undefined) updateData.lowRate = String(lowRate)
    if (highRate !== undefined) updateData.highRate = String(highRate)
    if (defaultPercentile !== undefined) updateData.defaultPercentile = defaultPercentile
    if (isActive !== undefined) updateData.isActive = isActive

    const updatedTier = await prisma.tier.update({
      where: { id },
      data: updateData,
      include: { criteriaSet: { select: { id: true, name: true } } }
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

    const existingTier = await prisma.tier.findFirst({
      where: { id, tenantId: req.tenantId!, isActive: true }
    })
    if (!existingTier) { res.status(404).json({ error: 'Tier not found' }); return }

    // Soft-delete (preserves FK integrity with assessments)
    await prisma.tier.update({ where: { id }, data: { isActive: false } })
    res.json({ message: 'Tier deleted successfully' })
  } catch (error) {
    console.error('Error deleting tier:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
