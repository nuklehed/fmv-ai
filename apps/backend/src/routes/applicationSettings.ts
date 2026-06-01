import { Router } from 'express'
import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate, requireAdminOrSA } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// All application settings routes require authentication and Admin/SA role
router.use(authenticate)
router.use(requireAdminOrSA)

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
      update: { value: value as any, description: description || undefined },
      create: {
        key,
        value: value as any,
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

export default router
