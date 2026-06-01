import { Router } from 'express'
import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// All notification routes require authentication
router.use(authenticate)

/**
 * GET /api/notifications
 * List notifications for the current user with pagination and read filter
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const unreadOnly = req.query.unreadOnly === 'true'

    const where: Record<string, unknown> = { userId: req.userId! }
    if (unreadOnly) {
      where.readAt = null
    }

    // Fetch total count for pagination
    const totalCount = await prisma.notification.count({ where })

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    })

    // Get unread count separately for the badge
    const unreadCount = await prisma.notification.count({
      where: { userId: req.userId!, readAt: null }
    })

    res.json({
      data: notifications,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      },
      unreadCount
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/notifications/unread-count
 * Get just the unread count for the notification bell badge
 */
router.get('/unread-count', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { userId: req.userId!, readAt: null }
    })

    res.json({ unreadCount })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put('/:id/read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const notification = await prisma.notification.findFirst({
      where: { id, userId: req.userId! }
    })

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() }
    })

    res.json(updated)
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications for the current user as read
 */
router.put('/mark-all-read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, readAt: null },
      data: { readAt: new Date() }
    })

    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const notification = await prisma.notification.findFirst({
      where: { id, userId: req.userId! }
    })

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }

    await prisma.notification.delete({ where: { id } })

    res.json({ message: 'Notification deleted' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
