import { Router } from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse'
import type { Response } from 'express'
import { PrismaClient, AssessmentStatus } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate, requireAdminOrSA, requireBUOrHigher } from '../middleware/auth'
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

/**
 * PUT /api/assessments/:id/review
 * Admin review — override AI answer selections with rationale
 */
router.put('/:id/review', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { overrides, rejectionReason } = req.body

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        hcp: true,
        criteriaSet: {
          include: {
            questions: {
              where: { isActive: true },
              include: { answers: { where: { isActive: true } } }
            }
          }
        }
      }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only AI_COMPLETE assessments can be reviewed
    if (existingAssessment.status !== AssessmentStatus.AI_COMPLETE) {
      res.status(400).json({ error: 'Only AI-complete assessments can be reviewed' })
      return
    }

    const aiResults = existingAssessment.aiResults as Record<string, unknown>[] | undefined || []
    const finalResults = overrides ? [...aiResults] : aiResults

    // Apply overrides if provided
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        const { questionId, selectedAnswerId, rationale } = override

        if (!questionId || !selectedAnswerId) continue

        // Validate the answer belongs to this question
        const question = existingAssessment.criteriaSet?.questions.find(q => q.id === questionId)
        if (!question) {
          res.status(400).json({ error: `Question ${questionId} not found in criteria set` })
          return
        }

        const answerExists = question.answers.some(a => a.id === selectedAnswerId)
        if (!answerExists) {
          res.status(400).json({ error: `Answer ${selectedAnswerId} not valid for question ${questionId}` })
          return
        }

        // Find and update the result in aiResults
        const existingResultIndex = finalResults.findIndex((r: any) => r.questionId === questionId)
        if (existingResultIndex >= 0) {
          ;(finalResults as any[])[existingResultIndex] = {
            ...finalResults[existingResultIndex],
            selectedAnswerId,
            rationale: String(rationale || '').slice(0, 500), // Cap rationale length
            isOverride: true,
            overriddenBy: req.userId,
            overriddenAt: new Date().toISOString()
          }
        } else {
          finalResults.push({
            questionId,
            selectedAnswerId,
            rationale: String(rationale || '').slice(0, 500),
            isOverride: true,
            overriddenBy: req.userId,
            overriddenAt: new Date().toISOString()
          })
        }
      }
    }

    // Calculate total score from final results
    let totalScore = 0
    for (const result of finalResults) {
      const question = existingAssessment.criteriaSet?.questions.find(q => q.id === result.questionId)
      if (question) {
        const answer = question.answers.find(a => a.id === result.selectedAnswerId)
        if (answer) {
          totalScore += answer.score
        }
      }
    }

    // Determine status: UNDER_REVIEW for overrides, REJECTED for rejection reason
    let newStatus = AssessmentStatus.UNDER_REVIEW as any
    if (rejectionReason && rejectionReason.trim()) {
      newStatus = AssessmentStatus.REJECTED
    }

    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: {
        aiResults: finalResults as any,
        totalScore,
        status: newStatus,
        rejectionReason: rejectionReason && rejectionReason.trim() ? rejectionReason : null,
        completedAt: new Date()
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } },
        tier: { select: { name: true, lowRate: true, highRate: true } }
      }
    })

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        userId: req.userId,
        userName: (req as any).userName || 'Admin',
        entityType: 'Assessment',
        entityId: id,
        action: rejectionReason && rejectionReason.trim() ? 'REJECT' : 'REVIEW_OVERRIDE',
        fieldChanged: 'aiResults',
        oldValue: aiResults as any,
        newValue: finalResults as any,
        rationale: rejectionReason || undefined
      }
    })

    // Create notification for BU if rejected
    if (newStatus === AssessmentStatus.REJECTED) {
      await prisma.notification.create({
        data: {
          userId: existingAssessment.submittedByUserId,
          type: 'ASSESSMENT_REJECTED',
          title: `Assessment Rejected — ${existingAssessment.hcp.firstName} ${existingAssessment.hcp.lastName}`,
          message: rejectionReason || 'Your assessment has been rejected. Please review and resubmit.'
        }
      })
    }

    res.json(updatedAssessment)
  } catch (error) {
    console.error('Error reviewing assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/assessments/:id/approve
 * Approve assessment with tier and rate assignment
 */
router.post('/:id/approve', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { tierId, rateOverride, rationale, effectiveDate, renewalDate } = req.body

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        hcp: true,
        tier: true,
        submittedByUser: true
      }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only UNDER_REVIEW assessments can be approved
    if (existingAssessment.status !== AssessmentStatus.UNDER_REVIEW) {
      res.status(400).json({ error: 'Only assessments under review can be approved' })
      return
    }

    if (!existingAssessment.totalScore) {
      res.status(400).json({ error: 'Cannot approve assessment without a total score' })
      return
    }

    // Determine tier and rate
    let assignedTierId = tierId || existingAssessment.tierId
    let finalRate = existingAssessment.rate as number | null

    if (!assignedTierId) {
      // Auto-assign tier based on score
      const tiers = await prisma.tier.findMany({
        where: {
          tenantId: req.tenantId!,
          specialtyId: existingAssessment.specialtyId || undefined
        },
        orderBy: { minScore: 'asc' }
      })

      const matchingTier = tiers.find(t => 
        existingAssessment.totalScore! >= t.minScore && 
        existingAssessment.totalScore! <= t.maxScore
      )

      if (!matchingTier) {
        res.status(400).json({ error: 'No tier matches the assessment score. Please assign a tier manually.' })
        return
      }

      assignedTierId = matchingTier.id

      // Calculate rate based on percentile (default 50th percentile)
      const range = Number(matchingTier.highRate) - Number(matchingTier.lowRate)
      finalRate = Number(matchingTier.lowRate) + (range * (matchingTier.defaultPercentile / 100))
    } else {
      // Validate tier belongs to tenant
      const tier = await prisma.tier.findFirst({
        where: { id: assignedTierId, tenantId: req.tenantId! }
      })

      if (!tier) {
        res.status(400).json({ error: 'Selected tier not found in your organization' })
        return
      }

      // Calculate rate based on percentile or use override
      const range = Number(tier.highRate) - Number(tier.lowRate)
      finalRate = rateOverride ? Number(rateOverride) : (Number(tier.lowRate) + (range * (tier.defaultPercentile / 100)))
    }

    // Validate rate is within tier bounds if override provided
    if (rateOverride && finalRate !== undefined) {
      const tier = await prisma.tier.findFirst({
        where: { id: assignedTierId, tenantId: req.tenantId! }
      })

      if (tier && (finalRate < Number(tier.lowRate) || finalRate > Number(tier.highRate))) {
        res.status(400).json({ error: 'Rate must be within tier bounds' })
        return
      }
    }

    // Calculate renewal date based on approval validity period (default 2 years)
    const startDate = effectiveDate ? new Date(effectiveDate) : new Date()
    let endDate = renewalDate ? new Date(renewalDate) : null

    if (!endDate) {
      // Get approval validity period from application settings (default 730 days = 2 years)
      const setting = await prisma.applicationSetting.findFirst({
        where: { key: 'approvalValidityPeriod', tenantId: req.tenantId! }
      })

      const validityDays = setting ? Number(setting.value) : 730
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + validityDays)
    }

    // Update assessment with approval details
    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: {
        status: AssessmentStatus.APPROVED,
        tierId: assignedTierId,
        rate: finalRate as any,
        approvedByUserId: req.userId,
        effectiveDate: startDate,
        renewalDate: endDate,
        completedAt: new Date()
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } },
        tier: { select: { name: true, lowRate: true, highRate: true } }
      }
    })

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        userId: req.userId,
        userName: (req as any).userName || 'Admin',
        entityType: 'Assessment',
        entityId: id,
        action: 'APPROVE',
        fieldChanged: 'status,tier,rate',
        oldValue: {
          status: AssessmentStatus.UNDER_REVIEW,
          tierId: existingAssessment.tierId,
          rate: existingAssessment.rate
        },
        newValue: {
          status: AssessmentStatus.APPROVED,
          tierId: assignedTierId,
          rate: finalRate
        },
        rationale: rationale || undefined
      }
    })

    // Create notification for BU
    await prisma.notification.create({
      data: {
        userId: existingAssessment.submittedByUserId,
        type: 'ASSESSMENT_APPROVED',
        title: `Assessment Approved — ${existingAssessment.hcp.firstName} ${existingAssessment.hcp.lastName}`,
        message: `Your assessment has been approved. Tier: ${updatedAssessment.tier?.name || 'N/A'}, Rate: $${finalRate?.toFixed(2) || '0.00'}`
      }
    })

    res.json(updatedAssessment)
  } catch (error) {
    console.error('Error approving assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/assessments/:id/reject
 * Reject assessment with reason — transitions to REJECTED status
 */
router.post('/:id/reject', authenticate, requireAdminOrSA, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { reason } = req.body

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Rejection reason is required' })
      return
    }

    // Multi-tenant isolation + role-based visibility
    const existingAssessment = await prisma.assessment.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: {
        hcp: true,
        submittedByUser: true
      }
    })

    if (!existingAssessment) {
      res.status(404).json({ error: 'Assessment not found' })
      return
    }

    // Only UNDER_REVIEW assessments can be rejected
    if (existingAssessment.status !== AssessmentStatus.UNDER_REVIEW) {
      res.status(400).json({ error: 'Only assessments under review can be rejected' })
      return
    }

    const updatedAssessment = await prisma.assessment.update({
      where: { id },
      data: {
        status: AssessmentStatus.REJECTED,
        rejectionReason: reason.trim(),
        completedAt: new Date()
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } }
      }
    })

    // Create audit trail entry
    await prisma.auditTrail.create({
      data: {
        userId: req.userId,
        userName: (req as any).userName || 'Admin',
        entityType: 'Assessment',
        entityId: id,
        action: 'REJECT',
        fieldChanged: 'status,rejectionReason',
        oldValue: { status: AssessmentStatus.UNDER_REVIEW },
        newValue: { status: AssessmentStatus.REJECTED, rejectionReason: reason.trim() },
        rationale: reason
      }
    })

    // Create notification for BU
    await prisma.notification.create({
      data: {
        userId: existingAssessment.submittedByUserId,
        type: 'ASSESSMENT_REJECTED',
        title: `Assessment Rejected — ${existingAssessment.hcp.firstName} ${existingAssessment.hcp.lastName}`,
        message: reason
      }
    })

    res.json(updatedAssessment)
  } catch (error) {
    console.error('Error rejecting assessment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
