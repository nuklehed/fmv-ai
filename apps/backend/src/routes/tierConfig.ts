import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createSaRouter } from './saRouter'

const router = createSaRouter()
const prisma = new PrismaClient()

/**
 * GET /api/tier-config
 * Get the tier configuration for the tenant (upserts if not exists)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const config = await prisma.tierConfig.upsert({
      where: { tenantId: req.tenantId! },
      create: { tenantId: req.tenantId!, numberOfTiers: 3 },
      update: {},
      select: { id: true, numberOfTiers: true, tenantId: true, createdAt: true, updatedAt: true }
    })

    res.json(config)
  } catch (error) {
    console.error('Error fetching tier config:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/tier-config
 * Update the number of tiers for the tenant
 */
router.put('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { numberOfTiers } = req.body

    if (numberOfTiers === undefined || numberOfTiers === null) {
      res.status(400).json({ error: 'numberOfTiers is required' })
      return
    }

    if (!Number.isInteger(numberOfTiers) || numberOfTiers < 1 || numberOfTiers > 20) {
      res.status(400).json({ error: 'numberOfTiers must be an integer between 1 and 20' })
      return
    }

    const config = await prisma.tierConfig.upsert({
      where: { tenantId: req.tenantId! },
      create: { tenantId: req.tenantId!, numberOfTiers },
      update: { numberOfTiers },
      select: { id: true, numberOfTiers: true, tenantId: true, createdAt: true, updatedAt: true }
    })

    res.json(config)
  } catch (error) {
    console.error('Error updating tier config:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
