import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAuthedRouter } from './saRouter'

const router = createAuthedRouter()
const prisma = new PrismaClient()

/**
 * GET /api/users/me/settings
 * Get notification preferences for the current user
 */
router.get('/me/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const setting = await prisma.applicationSetting.findFirst({
      where: { key: 'notificationPreferences', userId: req.userId! }
    })

    // Default preferences if none set
    const preferences = setting 
      ? JSON.parse(setting.value) 
      : { inApp: true, email: true }

    res.json({
      inApp: preferences.inApp !== false,  // default true
      email: preferences.email !== false   // default true
    })
  } catch (error) {
    console.error('Error fetching user settings:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/users/me/settings
 * Update notification preferences for the current user
 */
router.put('/me/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { inApp, email } = req.body

    // Validate input
    if (inApp !== undefined && typeof inApp !== 'boolean') {
      res.status(400).json({ error: 'inApp must be a boolean' })
      return
    }
    if (email !== undefined && typeof email !== 'boolean') {
      res.status(400).json({ error: 'email must be a boolean' })
      return
    }

    const preferences = {
      inApp: inApp !== false,  // default true
      email: email !== false   // default true
    }

    // Upsert the notification preferences setting
    await prisma.applicationSetting.upsert({
      where: {
        key_tenantId: {
          key: 'notificationPreferences',
          tenantId: req.tenantId!
        }
      },
      update: { value: JSON.stringify(preferences), userId: req.userId! },
      create: {
        key: 'notificationPreferences',
        value: JSON.stringify(preferences),
        description: 'User notification channel preferences (in-app and email)',
        tenantId: req.tenantId!,
        userId: req.userId!
      }
    })

    res.json(preferences)
  } catch (error) {
    console.error('Error updating user settings:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
