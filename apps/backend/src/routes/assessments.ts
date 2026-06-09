import multer from 'multer'
import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createBuRouter, requireAdminOrSA, authenticate } from './saRouter'
import { AssessmentDomain } from '../domain/assessment'

const router = createBuRouter()
const prisma = new PrismaClient()
const domain = new AssessmentDomain(prisma)

// Configure multer for PDF uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req: any, _file: any, cb: any) => {
    if (_file.mimetype === 'application/pdf') {
      (cb as any)(null, true)
    } else {
      (cb as any)(new Error('Only PDF files are allowed'), false)
    }
  }
})



/** GET /api/assessments — List assessments */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await domain.listPaginated({
      tenantId: req.tenantId!,
      userId: req.userId,
      userRole: req.userRole,
      page: Math.max(1, parseInt(req.query.page as string) || 1),
      limit: Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25)),
      search: req.query.search as string | undefined,
      statusFilter: req.query.status as string | undefined
    })
    res.json(result)
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** GET /api/assessments/:id — Get single assessment */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const assessment = await domain.getById(
      req.params.id, req.tenantId!, req.userId, req.userRole
    )

    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    res.json(assessment)
  } catch (_error) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

/** POST /api/assessments — Create draft */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { hcpId, specialtyId, criteriaSetId } = req.body

    if (!hcpId) {
      res.status(400).json({ error: 'HCP ID is required' })
      return
    }

    const assessment = await domain.createDraft(hcpId, req.tenantId!, req.userId!, specialtyId, criteriaSetId)
    res.status(201).json(assessment)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message })
    } else {
      console.error('Error creating assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** PUT /api/assessments/:id — Update assessment */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { hcpId, specialtyId, criteriaSetId, status, rejectionReason } = req.body

    const assessment = await domain.updateAssessment(
      req.params.id,
      { hcpId, specialtyId, criteriaSetId, status, rejectionReason },
      req.tenantId!,
      req.userRole!
    )
    res.json(assessment)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && (error.message.includes('Only draft') || error.message.includes('administrators can') || error.message.includes('Invalid status'))) {
      const code = error.message.includes('administrators') ? 403 : 400
      res.status(code).json({ error: error.message })
    } else {
      console.error('Error updating assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/cv — Upload CV PDF */
router.post('/:id/cv', upload.single('cv'), async (req: AuthenticatedRequest & { file?: Express.Multer.File }, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' })
      return
    }

    const result = await domain.uploadCV(req.params.id, req.file.buffer, req.tenantId!)
    res.json({ message: 'CV uploaded and text extracted successfully', ...result })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Only PDF')) {
      res.status(400).json({ error: 'Only PDF files are allowed' })
    } else if (error instanceof Error && (error.message.includes('not found') || error.message.includes('CV cannot'))) {
      const code = error.message.includes('not found') ? 404 : 400
      res.status(code).json({ error: error.message })
    } else {
      console.error('Error uploading CV:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/submit — Submit for AI processing */
router.post('/:id/submit', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await domain.submitForAI(req.params.id, req.userId!, req.tenantId!)
    res.json(result)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && (error.message.includes('Only draft') || error.message.includes('missing required'))) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error submitting assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/cancel — Cancel assessment stuck in AI_PROCESSING */
router.post('/:id/cancel', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await domain.cancelAssessment(req.params.id, req.userId!, req.tenantId!)
    res.json(result)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && error.message.includes('Cannot cancel')) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error cancelling assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/retry — Retry AI processing for failed assessments (Admin/SA only) */
router.post('/:id/retry', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await domain.retryAIProcessing(req.params.id, req.userId!, req.tenantId!)
    res.json(result)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && (error.message.includes('Cannot retry') || error.message.includes('missing required'))) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error retrying assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** DELETE /api/assessments/:id — Delete assessment */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await domain.deleteAssessment(req.params.id, req.tenantId!, req.userRole!)
    res.json({ message: 'Assessment deleted successfully' })
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && error.message.includes('Only draft')) {
      res.status(403).json({ error: error.message })
    } else {
      console.error('Error deleting assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** PUT /api/assessments/:id/review — Admin review with overrides */
router.put('/:id/review', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { overrides, rejectionReason } = req.body

    const assessment = await domain.reviewWithOverrides(
      req.params.id, overrides || [], rejectionReason, req.userId!, req.tenantId!
    )
    res.json(assessment)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && error.message.includes('Only AI-complete')) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error reviewing assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/approve — Approve with tier/rate */
router.post('/:id/approve', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { tierLabel, rateOverride, rationale, effectiveDate, renewalDate } = req.body

    const assessment = await domain.approveWithTier(
      req.params.id, tierLabel, rateOverride, rationale,
      effectiveDate ? new Date(effectiveDate) : undefined,
      renewalDate ? new Date(renewalDate) : undefined,
      req.userId!, req.tenantId!
    )
    res.json(assessment)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && (error.message.includes('Only assessments') || error.message.includes('without a total score') || error.message.includes('No tier matches') || error.message.includes('Rate must'))) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error approving assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

/** POST /api/assessments/:id/reject — Reject with reason */
router.post('/:id/reject', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }

    const assessment = await domain.rejectWithReason(req.params.id, reason, req.userId!, req.tenantId!)
    res.json(assessment)
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Assessment not found' })
    } else if (error instanceof Error && error.message.includes('Only assessments')) {
      res.status(400).json({ error: error.message })
    } else {
      console.error('Error rejecting assessment:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

export default router
