import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAdminRouter, createSaRouter } from '../middleware/routeGroups'

const router = createAdminRouter()
const prisma = new PrismaClient()

/**
 * GET /api/application-settings
 * List all application settings for the tenant
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settings = await prisma.applicationSetting.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { key: 'asc' }
    })

    res.json(settings)
  } catch (error) {
    console.error('Error fetching application settings:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/application-settings/:key
 * Get a single application setting by key
 */
router.get('/:key', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params

    const setting = await prisma.applicationSetting.findFirst({
      where: { key, tenantId: req.tenantId! }
    })

    if (!setting) {
      res.status(404).json({ error: 'Application setting not found' })
      return
    }

    res.json(setting)
  } catch (error) {
    console.error('Error fetching application setting:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/application-settings/:key
 * Update or create an application setting
 */
router.put('/:key', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params
    const { value, description } = req.body

    if (value === undefined) {
      res.status(400).json({ error: 'Value is required' })
      return
    }

    const setting = await prisma.applicationSetting.upsert({
      where: {
        key_tenantId: {
          key,
          tenantId: req.tenantId!
        }
      },
      update: { value, description: description || undefined },
      create: {
        key,
        value,
        description: description || '',
        tenantId: req.tenantId!
      }
    })

    res.json(setting)
  } catch (error) {
    console.error('Error updating application setting:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Tier Config (SA only) ──────────────────────────────────────────
// GET/PUT /api/tier-config — computed view backed by ApplicationSettings
const tierConfigRouter = createSaRouter()

/**
 * GET /api/tier-config
 * Get the global tier configuration for the tenant (stored as ApplicationSetting)
 */
tierConfigRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
tierConfigRouter.put('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

export { router, tierConfigRouter }
