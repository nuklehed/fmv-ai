import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createSaRouter } from './saRouter'

const router = createSaRouter()
const prisma = new PrismaClient()

/**
 * GET /api/tier-config
 * Get the global tier configuration for the tenant (stored as ApplicationSetting)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const setting = await prisma.applicationSetting.findFirst({
      where: { key: 'numberOfTiers', tenantId: req.tenantId! }
    })

    const config = {
      id: 'global',
      numberOfTiers: setting ? parseInt(setting.value) : 3,
      tenantId: req.tenantId!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    res.json(config)
  } catch (error) {
    console.error('Error fetching tier config:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/tier-config
 * Update the global number of tiers for the tenant
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

    await prisma.applicationSetting.upsert({
      where: { key_tenantId: { key: 'numberOfTiers', tenantId: req.tenantId! } },
      create: { key: 'numberOfTiers', value: String(numberOfTiers), tenantId: req.tenantId! },
      update: { value: String(numberOfTiers) }
    })

    const config = {
      id: 'global',
      numberOfTiers,
      tenantId: req.tenantId!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    res.json(config)
  } catch (error) {
    console.error('Error updating tier config:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
