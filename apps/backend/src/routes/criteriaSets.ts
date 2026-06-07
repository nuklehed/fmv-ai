import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAdminRouter } from './saRouter'

const router = createAdminRouter()
const prisma = new PrismaClient()

/**
 * GET /api/criteria-sets
 * List criteria sets (active by default, filter for all)
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

    const criteriaSets = await prisma.criteriaSet.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    res.json(criteriaSets)
  } catch (error) {
    console.error('Error fetching criteria sets:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/criteria-sets/:id
 * Get a single criteria set with full hierarchy
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation
    const criteriaSet = await prisma.criteriaSet.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    if (!criteriaSet) {
      res.status(404).json({ error: 'Criteria set not found' })
      return
    }

    res.json(criteriaSet)
  } catch (error) {
    console.error('Error fetching criteria set:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/criteria-sets
 * Create a new criteria set (SA only for system prompt)
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, description, systemPrompt } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Criteria set name is required' })
      return
    }

    // Multi-tenant isolation — use tenant from authenticated user
    const tenantId = req.tenantId!

    // Check for duplicate name within the same tenant
    const existing = await prisma.criteriaSet.findFirst({
      where: {
        name: { equals: name.trim() },
        tenantId,
        isActive: true
      }
    })

    if (existing) {
      res.status(409).json({ error: `A criteria set with the name "${name}" already exists in your organization` })
      return
    }

    // System prompt is SA-only — Admins cannot create with systemPrompt
    if (req.userRole !== 'SA' && systemPrompt) {
      res.status(403).json({ error: 'Only Superadmins can set a system prompt' })
      return
    }

    const criteriaSet = await prisma.criteriaSet.create({
      data: {
        name: name.trim(),
        description: description || null,
        systemPrompt: req.userRole === 'SA' ? (systemPrompt || null) : null,
        tenantId
      },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    res.status(201).json(criteriaSet)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Criteria set name must be unique within your organization' })
      return
    }

    console.error('Error creating criteria set:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/criteria-sets/:id
 * Update a criteria set (SA-only for system prompt; Admins can edit name/description only)
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { name, description, isActive, systemPrompt } = req.body

    // Multi-tenant isolation — verify criteria set belongs to user's tenant
    const existing = await prisma.criteriaSet.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'Criteria set not found' })
      return
    }

    // System prompt is SA-only — Admins cannot modify it
    if (req.userRole !== 'SA' && systemPrompt !== undefined) {
      res.status(403).json({ error: 'Only Superadmins can edit the system prompt' })
      return
    }

    // Check for duplicate name (excluding current criteria set)
    if (name && typeof name === 'string') {
      const duplicate = await prisma.criteriaSet.findFirst({
        where: {
          id: { not: id },
          name: { equals: name.trim() },
          tenantId: req.tenantId!,
          isActive: true
        }
      })

      if (duplicate) {
        res.status(409).json({ error: `A criteria set with the name "${name}" already exists in your organization` })
        return
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name && typeof name === 'string') updateData.name = name.trim()
    if (description !== undefined) updateData.description = description || null
    if (isActive !== undefined) updateData.isActive = isActive
    // Only SA can set systemPrompt
    if (req.userRole === 'SA' && systemPrompt !== undefined) {
      updateData.systemPrompt = systemPrompt || null
    }

    const criteriaSet = await prisma.criteriaSet.update({
      where: { id },
      data: updateData,
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    res.json(criteriaSet)
  } catch (error) {
    console.error('Error updating criteria set:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/criteria-sets/:id
 * Soft-delete a criteria set by setting isActive=false (SA only)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation — verify criteria set belongs to user's tenant
    const existing = await prisma.criteriaSet.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'Criteria set not found' })
      return
    }

    const criteriaSet = await prisma.criteriaSet.update({
      where: { id },
      data: { isActive: false },
      include: {
        questions: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            answers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    res.json({ message: 'Criteria set deactivated', criteriaSet })
  } catch (error) {
    console.error('Error deleting criteria set:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * ─── Questions ──────────────────────────────────────────────────────
 */

/**
 * POST /api/criteria-sets/:criteriaSetId/questions
 * Add a question to a criteria set (Admin/SA)
 */
router.post('/:criteriaSetId/questions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId } = req.params
    const { text, order } = req.body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Question text is required' })
      return
    }

    // Multi-tenant isolation — verify criteria set belongs to user's tenant
    const criteriaSet = await prisma.criteriaSet.findFirst({
      where: { id: criteriaSetId, tenantId: req.tenantId! }
    })

    if (!criteriaSet) {
      res.status(404).json({ error: 'Criteria set not found' })
      return
    }

    // Determine order — append at end if not specified
    const maxOrder = await prisma.question.aggregate({
      where: { criteriaSetId },
      _max: { order: true }
    })
    const questionOrder = order !== undefined ? Number(order) : (maxOrder._max.order ?? -1) + 1

    const question = await prisma.question.create({
      data: {
        text: text.trim(),
        criteriaSetId,
        order: questionOrder
      },
      include: {
        answers: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    })

    res.status(201).json(question)
  } catch (error) {
    console.error('Error creating question:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/criteria-sets/:criteriaSetId/questions/:questionId
 * Update a question (Admin/SA)
 */
router.put('/:criteriaSetId/questions/:questionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId, questionId } = req.params
    const { text, order, isActive } = req.body

    // Multi-tenant isolation — verify question belongs to user's tenant via criteria set
    const existing = await prisma.question.findFirst({
      where: { id: questionId, criteriaSetId },
      include: { criteriaSet: true }
    })

    if (!existing || existing.criteriaSet.tenantId !== req.tenantId) {
      res.status(404).json({ error: 'Question not found' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (text && typeof text === 'string') updateData.text = text.trim()
    if (order !== undefined) updateData.order = Number(order)
    if (isActive !== undefined) updateData.isActive = isActive

    const question = await prisma.question.update({
      where: { id: questionId },
      data: updateData,
      include: {
        answers: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    })

    res.json(question)
  } catch (error) {
    console.error('Error updating question:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/criteria-sets/:criteriaSetId/questions/:questionId
 * Soft-delete a question (Admin/SA)
 */
router.delete('/:criteriaSetId/questions/:questionId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId, questionId } = req.params

    // Multi-tenant isolation — verify question belongs to user's tenant via criteria set
    const existing = await prisma.question.findFirst({
      where: { id: questionId, criteriaSetId },
      include: { criteriaSet: true }
    })

    if (!existing || existing.criteriaSet.tenantId !== req.tenantId) {
      res.status(404).json({ error: 'Question not found' })
      return
    }

    const question = await prisma.question.update({
      where: { id: questionId },
      data: { isActive: false }
    })

    res.json({ message: 'Question deactivated', question })
  } catch (error) {
    console.error('Error deleting question:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * ─── Answers ────────────────────────────────────────────────────────
 */

/**
 * POST /api/criteria-sets/:criteriaSetId/questions/:questionId/answers
 * Add an answer to a question (Admin/SA)
 */
router.post('/:criteriaSetId/questions/:questionId/answers', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId, questionId } = req.params
    const { text, score, order } = req.body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({ error: 'Answer text is required' })
      return
    }

    if (score === undefined || score === null || !Number.isInteger(score) || score < 0) {
      res.status(400).json({ error: 'Score must be a non-negative integer' })
      return
    }

    // Multi-tenant isolation — verify question belongs to user's tenant via criteria set
    const existing = await prisma.question.findFirst({
      where: { id: questionId, criteriaSetId },
      include: { criteriaSet: true }
    })

    if (!existing || existing.criteriaSet.tenantId !== req.tenantId) {
      res.status(404).json({ error: 'Question not found' })
      return
    }

    // Determine order — append at end if not specified
    const maxOrder = await prisma.answer.aggregate({
      where: { questionId },
      _max: { order: true }
    })
    const answerOrder = order !== undefined ? Number(order) : (maxOrder._max.order ?? -1) + 1

    const answer = await prisma.answer.create({
      data: {
        text: text.trim(),
        questionId,
        score: Number(score),
        order: answerOrder
      },
      include: { question: true }
    })

    res.status(201).json(answer)
  } catch (error) {
    console.error('Error creating answer:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/criteria-sets/:criteriaSetId/questions/:questionId/answers/:answerId
 * Update an answer (Admin/SA)
 */
router.put('/:criteriaSetId/questions/:questionId/answers/:answerId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId: _criteriaSetId, questionId, answerId } = req.params
    const { text, score, order, isActive } = req.body

    // Multi-tenant isolation — verify answer belongs to user's tenant via criteria set
    const existing = await prisma.answer.findFirst({
      where: { id: answerId, questionId },
      include: { question: { include: { criteriaSet: true } } }
    })

    if (!existing || !existing.question.criteriaSet || existing.question.criteriaSet.tenantId !== req.tenantId) {
      res.status(404).json({ error: 'Answer not found' })
      return
    }

    // Validate score if provided
    if (score !== undefined && (score === null || !Number.isInteger(score) || score < 0)) {
      res.status(400).json({ error: 'Score must be a non-negative integer' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (text && typeof text === 'string') updateData.text = text.trim()
    if (score !== undefined) updateData.score = Number(score)
    if (order !== undefined) updateData.order = Number(order)
    if (isActive !== undefined) updateData.isActive = isActive

    const answer = await prisma.answer.update({
      where: { id: answerId },
      data: updateData,
      include: { question: true }
    })

    res.json(answer)
  } catch (error) {
    console.error('Error updating answer:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/criteria-sets/:criteriaSetId/questions/:questionId/answers/:answerId
 * Soft-delete an answer (Admin/SA)
 */
router.delete('/:criteriaSetId/questions/:questionId/answers/:answerId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId: _criteriaSetId, questionId, answerId } = req.params

    // Multi-tenant isolation — verify answer belongs to user's tenant via criteria set
    const existing = await prisma.answer.findFirst({
      where: { id: answerId, questionId },
      include: { question: { include: { criteriaSet: true } } }
    })

    if (!existing || !existing.question.criteriaSet || existing.question.criteriaSet.tenantId !== req.tenantId) {
      res.status(404).json({ error: 'Answer not found' })
      return
    }

    const answer = await prisma.answer.update({
      where: { id: answerId },
      data: { isActive: false }
    })

    res.json({ message: 'Answer deactivated', answer })
  } catch (error) {
    console.error('Error deleting answer:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
