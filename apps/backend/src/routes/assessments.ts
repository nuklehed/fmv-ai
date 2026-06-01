import { Router } from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse'
import type { Response } from 'express'
import { PrismaClient, AssessmentStatus } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate, requireBUOrHigher } from '../middleware/auth'
import { getAIQueue } from '../services/queue'

const router = Router()
const prisma = new PrismaClient()

// Configure multer for PDF uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  }
})

// All assessment routes require authentication and BU role or higher
router.use(authenticate)
router.use(requireBUOrHigher)

/**
 * GET /api/assessments
 * List assessments — BUs see only their own, Admins/SAs see all in tenant
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const search = req.query.search as string | undefined
    const statusFilter = req.query.status as AssessmentStatus | undefined

    // Multi-tenant isolation + role-based visibility
    const where: Record<string, unknown> = { tenantId: req.tenantId! }

    if (req.userRole === 'BU') {
      where.submittedByUserId = req.userId!
    }

    if (search && typeof search === 'string' && search.length > 0) {
      const hcpWhere = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } }
        ]
      }
      where.hcp = hcpWhere
    }

    if (statusFilter) {
      where.status = statusFilter
    }

    // Fetch total count for pagination
    const totalCount = await prisma.assessment.count({ where })

    // Fetch paginated results with HCP and user info
    const assessments = await prisma.assessment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        hcp: { select: { firstName: true, lastName: true, email: true } },
        submittedByUser: { select: { id: true, email: true } },
        tier: { select: { name: true, lowRate: true, highRate: true } }
      }
    })

    res.json({
      data: assessments,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching assessments:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/assessments/:id
 * Get single assessment details with full HCP and criteria info
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation + role-based visibility
    const where: Record<string, unknown> = { id, tenantId: req.tenantId! }
    if (req.userRole === 'BU') {
      where.submittedByUserId = req.userId!
    }

    const assessment = await prisma.assessment.findFirst({
      where,
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } },
        specialty: { select: { id: true, name: true } },
        criteriaSet: {
          include: {
            questions: {
              where: { isActive: true },
              include: { answers: { where: { isActive: true } } }
            }
          }
        },
        tier: true
      }
    })

    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    res.json(assessment)
  } catch (error) {
    console.error('Error fetching assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/assessments
 * Create a new assessment draft (BU-facing)
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { hcpId, specialtyId, criteriaSetId } = req.body

    if (!hcpId) {
      res.status(400).json({ error: 'HCP ID is required' })
      return
    }

    // Multi-tenant isolation — verify HCP belongs to tenant
    const hcp = await prisma.hcp.findFirst({
      where: { id: hcpId, tenantId: req.tenantId!, isActive: true }
    })

    if (!hcp) {
      res.status(404).json({ error: 'HCP not found in your organization' })
      return
    }

    // Validate specialty and criteria set (if provided)
    if (specialtyId) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: specialtyId, tenantId: req.tenantId!, isActive: true }
      })
      if (!specialty) {
        res.status(404).json({ error: 'Specialty not found in your organization' })
        return
      }
    }

    if (criteriaSetId) {
      const criteriaSet = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId: req.tenantId!, isActive: true }
      })
      if (!criteriaSet) {
        res.status(404).json({ error: 'Criteria set not found in your organization' })
        return
      }
    }

    const assessment = await prisma.assessment.create({
      data: {
        hcpId,
        submittedByUserId: req.userId!,
        specialtyId: specialtyId || undefined,
        criteriaSetId: criteriaSetId || undefined,
        status: AssessmentStatus.DRAFT,
        tenantId: req.tenantId!
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } }
      }
    })

    res.status(201).json(assessment)
  } catch (error) {
    console.error('Error creating assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/assessments/:id
 * Update an assessment — BUs can edit drafts, Admins/SAs can update any status except during AI processing
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { hcpId, specialtyId, criteriaSetId, status, rejectionReason } = req.body

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { hcp: true }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // BUs can only edit drafts
    if (req.userRole === 'BU' && existingAssessment.status !== AssessmentStatus.DRAFT) {
      res.status(403).json({ error: 'Only draft assessments can be edited by business users' })
      return
    }

    const updateData: Record<string, unknown> = {}

    if (hcpId) {
      // Verify HCP belongs to tenant
      const hcp = await prisma.hcp.findFirst({
        where: { id: hcpId, tenantId: req.tenantId!, isActive: true }
      })
      if (!hcp) {
        res.status(404).json({ error: 'HCP not found in your organization' })
        return
      }
      updateData.hcpId = hcpId
    }

    if (specialtyId !== undefined) {
      if (specialtyId) {
        const specialty = await prisma.specialty.findFirst({
          where: { id: specialtyId, tenantId: req.tenantId!, isActive: true }
        })
        if (!specialty) {
          res.status(404).json({ error: 'Specialty not found in your organization' })
          return
        }
      }
      updateData.specialtyId = specialtyId || null
    }

    if (criteriaSetId !== undefined) {
      if (criteriaSetId) {
        const criteriaSet = await prisma.criteriaSet.findFirst({
          where: { id: criteriaSetId, tenantId: req.tenantId!, isActive: true }
        })
        if (!criteriaSet) {
          res.status(404).json({ error: 'Criteria set not found in your organization' })
          return
        }
      }
      updateData.criteriaSetId = criteriaSetId || null
    }

    // Status transitions — Admin/SA only (except BU submitting draft)
    if (status) {
      const currentStatus = existingAssessment.status as AssessmentStatus

      switch (status) {
        case AssessmentStatus.SUBMITTED:
          if (currentStatus !== AssessmentStatus.DRAFT) {
            res.status(400).json({ error: 'Only draft assessments can be submitted' })
            return
          }
          updateData.submittedAt = new Date()
          break

        case AssessmentStatus.UNDER_REVIEW:
        case AssessmentStatus.APPROVED:
        case AssessmentStatus.REJECTED:
          if (req.userRole !== 'ADMIN' && req.userRole !== 'SA') {
            res.status(403).json({ error: 'Only administrators can change assessment status to this value' })
            return
          }
          // Validate transition
          const validTransitions: Record<string, AssessmentStatus[]> = {
            [AssessmentStatus.AI_COMPLETE]: [AssessmentStatus.UNDER_REVIEW],
            [AssessmentStatus.APPROVED]: [AssessmentStatus.UNDER_REVIEW],
            [AssessmentStatus.REJECTED]: [AssessmentStatus.UNDER_REVIEW]
          }
          if (!validTransitions[currentStatus]?.includes(status as AssessmentStatus)) {
            res.status(400).json({ error: `Invalid status transition from ${currentStatus} to ${status}` })
            return
          }
          break

        default:
          res.status(400).json({ error: `Invalid status value: ${status}` })
          return
      }

      updateData.status = status as AssessmentStatus

      if (rejectionReason) {
        updateData.rejectionReason = rejectionReason
      }
    }

    const assessment = await prisma.assessment.update({
      where: { id },
      data: updateData,
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        tier: true
      }
    })

    res.json(assessment)
  } catch (error) {
    console.error('Error updating assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/assessments/:id/cv
 * Upload CV PDF and extract text — triggers AI processing queue when submitted
 */
interface FileRequest extends AuthenticatedRequest {
  file?: Express.Multer.File
}

router.post('/:id/cv', upload.single('cv'), async (req: FileRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    if (!req.file) {
      res.status(400).json({ error: 'PDF file is required' })
      return
    }

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { hcp: true }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only drafts can have CV uploaded (or rejected assessments for resubmission)
    const statusStr = String(existingAssessment.status)
    if (statusStr !== 'DRAFT' && statusStr !== 'REJECTED') {
      res.status(400).json({ error: `CV cannot be uploaded for assessments in ${existingAssessment.status} status` })
      return
    }

    // Extract text from PDF
    const pdfData = await pdfParse(req.file.buffer)
    const cvText = pdfData.text.trim()

    if (!cvText || cvText.length < 50) {
      res.status(400).json({ error: 'CV text extraction failed or content too short' })
      return
    }

    // Update assessment with extracted CV text
    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: { cvText }
    })

    res.json({
      message: 'CV uploaded and text extracted successfully',
      assessment: updatedAssessment,
      textLength: cvText.length
    })
  } catch (error) {
    console.error('Error uploading CV:', error)
    if (error instanceof Error && error.message.includes('Only PDF')) {
      res.status(400).json({ error: 'Only PDF files are allowed' })
      return
    }
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/assessments/:id/submit
 * Submit assessment for AI processing — transitions DRAFT → SUBMITTED → AI_PROCESSING
 */
router.post('/:id/submit', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { hcp: true }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only drafts can be submitted
    if (existingAssessment.status !== AssessmentStatus.DRAFT) {
      res.status(400).json({ error: 'Only draft assessments can be submitted' })
      return
    }

    // Validate required data exists
    if (!existingAssessment.cvText || !existingAssessment.criteriaSetId) {
      const missing = []
      if (!existingAssessment.cvText) missing.push('CV text')
      if (!existingAssessment.criteriaSetId) missing.push('criteria set')

      res.status(400).json({ error: `Cannot submit — missing required data: ${missing.join(', ')}` })
      return
    }

    // Transition through states and enqueue for AI processing
    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: {
        status: AssessmentStatus.AI_PROCESSING,
        submittedAt: new Date()
      }
    })

    // Enqueue job in BullMQ — worker will process sequentially
    const queue = getAIQueue()
    await queue.add('process-assessment', {
      assessmentId: id,
      userId: req.userId!
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 } // Retry with exponential backoff
    })

    res.json({
      message: 'Assessment submitted for AI processing',
      assessment: updatedAssessment,
      queuePosition: await queue.getWaitingCount() + 1
    })
  } catch (error) {
    console.error('Error submitting assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/assessments/:id
 * Delete/cancel an assessment — only drafts can be deleted
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { hcp: true }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only drafts can be deleted (Admin/SA can force-delete others)
    const isDraft = existingAssessment.status === AssessmentStatus.DRAFT
    const isAdminOrSA = req.userRole === 'ADMIN' || req.userRole === 'SA'

    if (!isDraft && !isAdminOrSA) {
      res.status(403).json({ error: 'Only draft assessments can be deleted by business users' })
      return
    }

    await prisma.assessment.delete({ where: { id } })

    res.json({ message: 'Assessment deleted successfully' })
  } catch (error) {
    console.error('Error deleting assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
