import { PrismaClient } from '@prisma/client'
type Assessment = any
type User = any

// ─── Domain Types ──────────────────────────────────────────────────

export interface ListParams {
  tenantId: string
  userId?: string
  userRole?: 'BU' | 'ADMIN' | 'SA'
  page: number
  limit: number
  search?: string
  statusFilter?: string
  /** Group results by HCP — returns only the latest assessment per HCP */
  groupedByHcp?: boolean
}

export interface ListResult {
  data: Assessment[]
  pagination: { page: number; limit: number; totalCount: number; totalPages: number }
}

export interface UpdateParams {
  hcpId?: string
  specialtyId?: string | null
  criteriaSetId?: string | null
  status?: string
  rejectionReason?: string
}

export interface Override {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

export interface SubmitResult {
  message: string
  assessment: Assessment & { submittedByUser: Pick<User, 'id' | 'email'> }
  queuePosition?: number
  note?: string
}

// ─── Status Transition Rules ──────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  AI_COMPLETE: ['UNDER_REVIEW'],
  APPROVED: ['UNDER_REVIEW'],
  REJECTED: ['UNDER_REVIEW']
}

function validateStatusTransition(currentStatus: string, targetStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus]
  if (!allowed?.includes(targetStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${targetStatus}`)
  }
}

// ─── AssessmentDomain Module ──────────────────────────────────────

/**
 * Deep domain module for assessment business logic.
 * Interface: 9 public methods, ~150 lines of implementation.
 * All callers (route handlers) learn one interface; tests hit the same seam.
 */
export class AssessmentDomain {
  constructor(private prisma: PrismaClient) {}

  // ─── Query Methods ──────────────────────────────────────────────

  async listPaginated(params: ListParams): Promise<ListResult> {
    const where: Record<string, unknown> = { tenantId: params.tenantId }

    if (params.userRole === 'BU' && params.userId) {
      where.submittedByUserId = params.userId
    }

    if (params.search && typeof params.search === 'string' && params.search.length > 0) {
      const hcpWhere: Record<string, unknown> = {
        OR: [
          { firstName: { contains: params.search } },
          { lastName: { contains: params.search } },
          { email: { contains: params.search } }
        ]
      }
      where.hcp = hcpWhere
    }

    if (params.statusFilter) {
      where.status = params.statusFilter
    }

    // Grouped mode: one assessment per HCP (latest by createdAt)
    if (params.groupedByHcp) {
      return this.listGroupedByHcp(where)
    }

    const totalCount = await this.prisma.assessment.count({ where })

    const assessments = await this.prisma.assessment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      include: {
        hcp: { select: { id: true, firstName: true, lastName: true, email: true } },
        submittedByUser: { select: { id: true, email: true } },
        specialty: { select: { id: true, name: true } }
      }
    })

    return {
      data: assessments,
      pagination: {
        page: params.page,
        limit: params.limit,
        totalCount,
        totalPages: Math.ceil(totalCount / params.limit)
      }
    }
  }

  /** Grouped mode: one assessment per HCP (latest by createdAt) */
  private async listGroupedByHcp(where: Record<string, unknown>): Promise<ListResult> {
    // Fetch all assessments matching the where clause, ordered newest first
    const assessments = await this.prisma.assessment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        hcp: { select: { id: true, firstName: true, lastName: true, email: true } },
        submittedByUser: { select: { id: true, email: true } },
        specialty: { select: { id: true, name: true } }
      }
    })

    // Deduplicate by hcpId — keep the latest (first in desc order)
    const seen = new Set<string>()
    const deduplicated = assessments.filter(a => {
      if (seen.has(a.hcpId)) return false
      seen.add(a.hcpId)
      return true
    })

    return {
      data: deduplicated,
      pagination: {
        page: 1,
        limit: deduplicated.length,
        totalCount: deduplicated.length,
        totalPages: 1
      }
    }
  }

  async getById(
    id: string,
    tenantId: string,
    userId?: string,
    userRole?: 'BU' | 'ADMIN' | 'SA'
  ): Promise<any | null> {
    const where: Record<string, unknown> = { id, tenantId }
    if (userRole === 'BU' && userId) {
      where.submittedByUserId = userId
    }

    return this.prisma.assessment.findFirst({
      where,
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } },
        specialty: { select: { id: true, name: true } },
        criteriaSet: {
          include: {
            questions: { where: { isActive: true }, include: { answers: { where: { isActive: true } } } }
          }
        },

      }
    })
  }

  // ─── Mutation Methods ──────────────────────────────────────────

  async createDraft(
    hcpId: string,
    tenantId: string,
    userId: string,
    specialtyId?: string,
    criteriaSetId?: string
  ): Promise<Assessment> {
    // Verify HCP belongs to tenant
    const hcp = await this.prisma.hcp.findFirst({
      where: { id: hcpId, tenantId, isActive: true }
    })
    if (!hcp) throw new Error('HCP not found in your organization')

    // Validate specialty (if provided)
    if (specialtyId) {
      const specialty = await this.prisma.specialty.findFirst({
        where: { id: specialtyId, tenantId, isActive: true }
      })
      if (!specialty) throw new Error('Specialty not found in your organization')
    }

    // Validate criteria set (if provided)
    if (criteriaSetId) {
      const criteriaSet = await this.prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId, tenantId, isActive: true }
      })
      if (!criteriaSet) throw new Error('Criteria set not found in your organization')
    }

    return this.prisma.assessment.create({
      data: {
        hcpId,
        submittedByUserId: userId,
        specialtyId: specialtyId || undefined,
        criteriaSetId: criteriaSetId || undefined,
        status: 'DRAFT',
        tenantId
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } }
      }
    })
  }

  async updateAssessment(
    id: string,
    updates: UpdateParams,
    tenantId: string,
    userRole: 'BU' | 'ADMIN' | 'SA'
  ): Promise<Assessment> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')

    // BUs can only edit drafts
    if (userRole === 'BU' && existing.status !== 'DRAFT') {
      throw new Error('Only draft assessments can be edited by business users')
    }

    const updateData: Record<string, unknown> = {}

    // Validate and apply HCP change
    if (updates.hcpId) {
      const hcp = await this.prisma.hcp.findFirst({
        where: { id: updates.hcpId, tenantId, isActive: true }
      })
      if (!hcp) throw new Error('HCP not found in your organization')
      updateData.hcpId = updates.hcpId
    }

    // Validate and apply specialty change
    if (updates.specialtyId !== undefined) {
      if (updates.specialtyId) {
        const specialty = await this.prisma.specialty.findFirst({
          where: { id: updates.specialtyId, tenantId, isActive: true }
        })
        if (!specialty) throw new Error('Specialty not found in your organization')
      }
      updateData.specialtyId = updates.specialtyId || null
    }

    // Validate and apply criteria set change
    if (updates.criteriaSetId !== undefined) {
      if (updates.criteriaSetId) {
        const criteriaSet = await this.prisma.criteriaSet.findFirst({
          where: { id: updates.criteriaSetId, tenantId, isActive: true }
        })
        if (!criteriaSet) throw new Error('Criteria set not found in your organization')
      }
      updateData.criteriaSetId = updates.criteriaSetId || null
    }

    // Validate and apply status transition
    if (updates.status) {
      const currentStatus = existing.status

      switch (updates.status) {
        case 'SUBMITTED':
          if (currentStatus !== 'DRAFT') {
            throw new Error('Only draft assessments can be submitted')
          }
          updateData.submittedAt = new Date()
          break

        case 'UNDER_REVIEW':
        case 'APPROVED':
        case 'REJECTED':
          if (userRole !== 'ADMIN' && userRole !== 'SA') {
            throw new Error('Only administrators can change assessment status to this value')
          }
          validateStatusTransition(currentStatus, updates.status)
          break

        default:
          throw new Error(`Invalid status value: ${updates.status}`)
      }

      updateData.status = updates.status

      if (updates.rejectionReason) {
        updateData.rejectionReason = updates.rejectionReason
      }
    }

    return this.prisma.assessment.update({
      where: { id },
      data: updateData,
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } }
      }
    })
  }

  async uploadCV(id: string, fileBuffer: Buffer, tenantId: string): Promise<{ assessment: Assessment; textLength: number }> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')

    // Only drafts or rejected assessments can have CV uploaded
    const statusStr = String(existing.status)
    if (statusStr !== 'DRAFT' && statusStr !== 'REJECTED') {
      throw new Error(`CV cannot be uploaded for assessments in ${existing.status} status`)
    }

    // Extract text from PDF using pdfjs-dist
    const pdfjsDist = await import('pdfjs-dist')
    const getDocumentFn = (pdfjsDist as Record<string, unknown>).default || pdfjsDist
    const { getDocument } = getDocumentFn as { getDocument: (input: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }>; numPages: number } }
    const uint8Array = new Uint8Array(fileBuffer)
    const pdfDoc = await getDocument({ data: uint8Array }).promise
    let cvText = ''
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item) => item.str ?? '').join(' ')
      cvText += pageText + '\n'
    }
    cvText = cvText.trim()

    if (!cvText || cvText.length < 50) {
      throw new Error('CV text extraction failed or content too short')
    }

    const updatedAssessment = await this.prisma.assessment.update({
      where: { id },
      data: { cvText }
    })

    return { assessment: updatedAssessment, textLength: cvText.length }
  }

  async submitForAI(
    id: string,
    userId: string,
    tenantId: string
  ): Promise<SubmitResult> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'DRAFT') throw new Error('Only draft assessments can be submitted')

    // Validate required data exists
    const missing: string[] = []
    if (!existing.cvText) missing.push('CV text')
    if (!existing.criteriaSetId) missing.push('criteria set')
    if (missing.length > 0) {
      throw new Error(`Cannot submit — missing required data: ${missing.join(', ')}`)
    }

    // Capture criteria snapshot for historical audit trail
    let criteriaSnapshot: Record<string, unknown> | null = null
    if (existing.criteriaSetId) {
      const criteriaSet = await this.prisma.criteriaSet.findFirst({
        where: { id: existing.criteriaSetId, isActive: true },
        include: {
          questions: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            include: {
              answers: { where: { isActive: true }, orderBy: { order: 'asc' } }
            }
          }
        }
      })

      if (criteriaSet) {
        criteriaSnapshot = {
          criteriaSetName: criteriaSet.name,
          systemPrompt: criteriaSet.systemPrompt,
          questions: criteriaSet.questions.map(q => ({
            id: q.id,
            text: q.text,
            order: q.order,
            answers: q.answers.map(a => ({ id: a.id, text: a.text, score: a.score }))
          })),
          capturedAt: new Date().toISOString()
        }
      }
    }

    // Transition to AI_PROCESSING (include criteria snapshot)
    const updatedAssessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        status: 'AI_PROCESSING',
        submittedAt: new Date(),
        criteriaSnapshot: criteriaSnapshot ? (criteriaSnapshot as any) : null
      },
      include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
    })

    // Enqueue job in BullMQ — worker will process sequentially
    const { getAIQueue } = await import('../services/queue')
    const queue = await getAIQueue()

    if (queue) {
      await queue.add('process-assessment', { assessmentId: id, userId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      return {
        message: 'Assessment submitted for AI processing (queued)',
        assessment: updatedAssessment,
        queuePosition: await queue.getWaitingCount() + 1
      }
    } else {
      // Fallback: synchronous processing when Redis is not available
      const { processAssessmentJob } = await import('../services/worker')
      try {
        await processAssessmentJob(id, userId)
        const refreshed = await this.prisma.assessment.findUnique({
          where: { id },
          include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
        })
        return { message: 'Assessment processed synchronously (no Redis queue)', assessment: refreshed }
      } catch (err) {
        console.error('Synchronous processing failed:', err)
        return {
          message: 'Assessment queued for synchronous processing',
          assessment: updatedAssessment,
          note: 'AI worker not available — process manually via POST /api/assessments/:id/process'
        }
      }
    }
  }

  async retryAIProcessing(
    id: string,
    userId: string,
    tenantId: string
  ): Promise<SubmitResult & { assessment: Assessment }> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'AI_FAILED') {
      throw new Error(`Cannot retry — assessment is in ${existing.status} status, only AI_FAILED assessments can be retried`)
    }

    // Validate required data exists
    const missing: string[] = []
    if (!existing.cvText) missing.push('CV text')
    if (!existing.criteriaSetId) missing.push('criteria set')
    if (missing.length > 0) {
      throw new Error(`Cannot retry — missing required data: ${missing.join(', ')}`)
    }

    // Capture criteria snapshot on retry if not already present
    const retrySnapshot = existing.criteriaSnapshot ? null : (
      existing.criteriaSetId ? await this.prisma.criteriaSet.findFirst({
        where: { id: existing.criteriaSetId, isActive: true },
        include: {
          questions: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            include: { answers: { where: { isActive: true }, orderBy: { order: 'asc' } } }
          }
        }
      }).then(cs => cs ? ({
        criteriaSetName: cs.name,
        systemPrompt: cs.systemPrompt,
        questions: cs.questions.map(q => ({ id: q.id, text: q.text, order: q.order, answers: q.answers.map(a => ({ id: a.id, text: a.text, score: a.score })) })),
        capturedAt: new Date().toISOString()
      }) : null) : null
    )

    // Transition back to AI_PROCESSING (include snapshot on retry)
    const updatedAssessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        status: 'AI_PROCESSING',
        submittedAt: new Date(),
        ...(retrySnapshot ? { criteriaSnapshot: retrySnapshot } : {})},
      include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
    })

    // Enqueue job in BullMQ — worker will process sequentially
    const { getAIQueue } = await import('../services/queue')
    const queue = await getAIQueue()

    if (queue) {
      await queue.add('process-assessment', { assessmentId: id, userId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      })

      return {
        message: 'Assessment re-queued for AI processing',
        assessment: updatedAssessment,
        queuePosition: await queue.getWaitingCount() + 1
      }
    } else {
      // Fallback: synchronous processing when Redis is not available
      const { processAssessmentJob } = await import('../services/worker')
      try {
        await processAssessmentJob(id, userId)
        const refreshed = await this.prisma.assessment.findUnique({
          where: { id },
          include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
        })
        return { message: 'Assessment processed synchronously (no Redis queue)', assessment: refreshed }
      } catch (err) {
        console.error('Synchronous retry processing failed:', err)
        await this.prisma.assessment.update({
          where: { id },
          data: {
            status: 'AI_FAILED',
            aiResults: JSON.stringify([{ questionId: 'error', selectedAnswerId: null, rationale: `Retry failed: ${err instanceof Error ? err.message : 'Unknown error'}` }]),
            completedAt: new Date()
          }
        })
        const failed = await this.prisma.assessment.findUnique({
          where: { id },
          include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
        })
        return {
          message: 'Retry failed — assessment marked as AI_FAILED',
          assessment: failed,
          note: 'AI worker not available — retry later via POST /api/assessments/:id/retry'
        }
      }
    }
  }

  /** Cancel an assessment stuck in AI_PROCESSING — removes from queue and resets status */
  async cancelAssessment(
    id: string,
    userId: string,
    tenantId: string
  ): Promise<{ message: string; assessment: Assessment }> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'AI_PROCESSING') {
      throw new Error(`Cannot cancel — assessment is in ${existing.status} status, only AI_PROCESSING assessments can be cancelled`)
    }

    // Remove from BullMQ queue if it exists
    const { getAIQueue } = await import('../services/queue')
    const queue = await getAIQueue()
    if (queue) {
      // Get all jobs for this assessment and remove them
      const [waitingJobs, activeJobs, failedJobs] = await Promise.all([
        queue.getJobs(['waiting']),
        queue.getJobs(['active']),
        queue.getJobs(['failed'])
      ])

      let removedCount = 0
      for (const job of [...waitingJobs, ...activeJobs, ...failedJobs]) {
        if (job.data.assessmentId === id) {
          try {
            if (job.state === 'active') {
              // Pause the worker first to prevent race conditions
              await queue.pause()
              await job.moveToFailed(new Error('Cancelled by user'), true)
              removedCount++
            } else {
              await job.remove()
              removedCount++
            }
          } catch (err) {
            console.warn(`Could not remove job ${job.id} from queue:`, err instanceof Error ? err.message : String(err))
          }
        }
      }

      // Resume the worker if we paused it
      if (removedCount > 0) {
        await queue.resume()
      }

      console.log(`[Cancel] Removed ${removedCount} job(s) for assessment ${id} from queue`)
    }

    // Reset status to DRAFT so user can resubmit or edit
    const updated = await this.prisma.assessment.update({
      where: { id },
      data: { status: 'DRAFT' },
      include: { hcp: true, submittedByUser: { select: { id: true, email: true } } }
    })

    console.log(`[Cancel] Assessment ${id} cancelled by user ${userId}, status reset to DRAFT`)
    return {
      message: 'Assessment cancelled and queued job removed',
      assessment: updated
    }
  }

  async deleteAssessment(id: string, tenantId: string, userRole: 'BU' | 'ADMIN' | 'SA'): Promise<void> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true }
    })

    if (!existing) throw new Error('Assessment not found')

    // Only drafts can be deleted (Admin/SA can force-delete others)
    const isDraft = existing.status === 'DRAFT'
    const isAdminOrSA = userRole === 'ADMIN' || userRole === 'SA'

    if (!isDraft && !isAdminOrSA) {
      throw new Error('Only draft assessments can be deleted by business users')
    }

    await this.prisma.assessment.delete({ where: { id } })
  }

  async reviewWithOverrides(
    id: string,
    overrides: Override[],
    rejectionReason: string | undefined,
    userId: string,
    tenantId: string
  ): Promise<Assessment> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
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

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'AI_COMPLETE') throw new Error('Only AI-complete assessments can be reviewed')

    // Parse existing AI results
    const aiResults = existing.aiResults ? JSON.parse(existing.aiResults) : []
    const finalResults = overrides ? [...aiResults] : aiResults

    // Apply overrides if provided
    if (overrides && Array.isArray(overrides)) {
      for (const override of overrides) {
        const { questionId, selectedAnswerId, rationale } = override
        if (!questionId || !selectedAnswerId) continue

        // Validate the answer belongs to this question
        const question = existing.criteriaSet?.questions.find((q) => q.id === questionId)
        if (!question) throw new Error(`Question ${questionId} not found in criteria set`)

        const answerExists = question.answers.some((a) => a.id === selectedAnswerId)
        if (!answerExists) throw new Error(`Answer ${selectedAnswerId} not valid for question ${questionId}`)

        // Find and update the result in aiResults
        const existingResultIndex = finalResults.findIndex((r: Record<string, unknown>) => (r as Record<string, unknown>).questionId === questionId)
        if (existingResultIndex >= 0) {
          ;(finalResults as typeof finalResults)[existingResultIndex] = {
            ...finalResults[existingResultIndex],
            selectedAnswerId,
            rationale: String(rationale || '').slice(0, 500),
            isOverride: true,
            overriddenBy: userId,
            overriddenAt: new Date().toISOString()
          }
        } else {
          finalResults.push({
            questionId,
            selectedAnswerId,
            rationale: String(rationale || '').slice(0, 500),
            isOverride: true,
            overriddenBy: userId,
            overriddenAt: new Date().toISOString()
          })
        }
      }
    }

    // Calculate total score from final results
    let totalScore = 0
    for (const result of finalResults) {
      const question = existing.criteriaSet?.questions.find((q) => q.id === result.questionId)
      if (question) {
        const answer = question.answers.find((a) => a.id === result.selectedAnswerId)
        if (answer) totalScore += answer.score
      }
    }

    // Determine status: UNDER_REVIEW for overrides, REJECTED for rejection reason
    let newStatus = 'UNDER_REVIEW' as string
    const trimmedReason = rejectionReason && rejectionReason.trim()
    if (trimmedReason) {
      newStatus = 'REJECTED'
    }

    const updatedAssessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        aiResults: JSON.stringify(finalResults),
        totalScore,
        status: newStatus,
        rejectionReason: trimmedReason || null,
        completedAt: new Date()
      },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } }
      }
    })

    // Create audit trail entry
    await this.prisma.auditTrail.create({
      data: {
        userId,
        userName: 'Admin',
        entityType: 'Assessment',
        entityId: id,
        action: trimmedReason ? 'REJECT' : 'REVIEW_OVERRIDE',
        fieldChanged: 'aiResults',
        oldValue: JSON.stringify(aiResults),
        newValue: JSON.stringify(finalResults),
        rationale: rejectionReason || undefined
      }
    })

    // Create notification for BU if rejected
    if (newStatus === 'REJECTED') {
      await this.prisma.notification.create({
        data: {
          userId: existing.submittedByUserId,
          type: 'ASSESSMENT_REJECTED',
          title: `Assessment Rejected — ${existing.hcp.firstName} ${existing.hcp.lastName}`,
          message: rejectionReason || 'Your assessment has been rejected. Please review and resubmit.'
        }
      })
    }

    return updatedAssessment
  }

  async approveWithTier(
    id: string,
    tierLabel: string | undefined,
    rateOverride: number | undefined,
    rationale: string | undefined,
    effectiveDate: Date | undefined,
    renewalDate: Date | undefined,
    userId: string,
    tenantId: string
  ): Promise<Assessment> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true, submittedByUser: true }
    })

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'UNDER_REVIEW') throw new Error('Only assessments under review can be approved')
    if (!existing.totalScore) throw new Error('Cannot approve assessment without a total score')

    // Get criteria set thresholds to determine valid tier labels
    const criteriaSet = await this.prisma.criteriaSet.findFirst({
      where: { id: existing.criteriaSetId! }
    })
    if (!criteriaSet) throw new Error('Criteria set not found')

    const thresholds = criteriaSet.tierThresholds ? JSON.parse(JSON.stringify(criteriaSet.tierThresholds)) : []
    if (thresholds.length === 0) throw new Error('No tier thresholds defined for this criteria set')

    // Determine tier label and rate from SpecialtyRate
    let assignedTierLabel: string | null = tierLabel || existing.tierLabel

    if (!assignedTierLabel) {
      // Auto-assign based on score matching thresholds
      const matchingThreshold = thresholds.find((t: any) =>
        existing.totalScore! >= (t as any).minScore &&
        existing.totalScore! <= (t as any).maxScore
      )

      if (!matchingThreshold) throw new Error('No tier matches the assessment score. Please assign a tier manually.')

      assignedTierLabel = matchingThreshold.label
    }

    // Look up SpecialtyRate for this specialty + criteria set + tier label
    const specialtyRate = await this.prisma.specialtyRate.findFirst({
      where: {
        specialtyId: existing.specialtyId!,
        criteriaSetId: existing.criteriaSetId!,
        tierLabel: assignedTierLabel!
      }
    })

    if (!specialtyRate) throw new Error(`No rate defined for ${assignedTierLabel} in this specialty. Please set rates first.`)

    // Calculate final rate — user override > auto-calc from SpecialtyRate range
    const range = Number(specialtyRate.highRate) - Number(specialtyRate.lowRate)
    let finalRate: number | null = null

    // Always compute the auto rate for comparison and override detection
    const pctSetting = await this.prisma.applicationSetting.findFirst({
      where: { key: 'defaultTierPercentile', tenantId }
    })
    const percentile = pctSetting ? Number(pctSetting.value) : 50
    let autoRate = Number(specialtyRate.lowRate) + (range * percentile / 100)

    // Optionally round to nearest $5
    const roundingSetting = await this.prisma.applicationSetting.findFirst({
      where: { key: 'roundTierRateToNearest5', tenantId }
    })
    const doRound = roundingSetting ? (roundingSetting.value === 'true' || Number(roundingSetting.value) === 1) : true
    if (doRound) {
      autoRate = Math.round(autoRate / 5) * 5
    }

    if (rateOverride != null && typeof rateOverride === 'number') {
      // User explicitly entered a rate — use it directly
      finalRate = rateOverride
    } else {
      // No user override — auto-calculate from SpecialtyRate range at configured percentile
      finalRate = autoRate
    }

    // Validate rate is within tier bounds
    if (finalRate != null &&
        (finalRate < Number(specialtyRate.lowRate) || finalRate > Number(specialtyRate.highRate))) {
      throw new Error('Rate must be within tier bounds')
    }

    // ─── Rate override validation (CONTEXT.md: mandatory rationale for overrides) ───
    let isRateOverride = false
    if (rateOverride != null && typeof rateOverride === 'number') {
      // If user-provided rate differs from auto-calculated rate, it's an override
      if (Math.abs(rateOverride - autoRate) > 0.01) {
        isRateOverride = true
        if (!rationale || !String(rationale).trim()) {
          throw new Error('Rate override requires a rationale explaining the deviation from the system-suggested rate')
        }
      }
    }

    // Calculate renewal date based on approval validity period (default 2 years)
    const startDate = effectiveDate ? new Date(effectiveDate) : new Date()
    let endDate: Date | null = renewalDate ? new Date(renewalDate) : null

    if (!endDate) {
      const setting = await this.prisma.applicationSetting.findFirst({
        where: { key: 'approvalValidityPeriod', tenantId }
      })

      const validityDays = setting ? Number(setting.value) : 730
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + validityDays)
    }

    // ─── Find existing active approval for same HCP (for auto-supersede) ───
    const oldActive = await this.prisma.assessment.findFirst({
      where: {
        hcpId: existing.hcpId,
        status: 'APPROVED',
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    })

    // ─── Approve new assessment + auto-supersede old one (atomic) ───
    const ops = [
      this.prisma.assessment.updateMany({
        where: { id },
        data: {
          status: 'APPROVED',
          tierLabel: assignedTierLabel,
          rate: finalRate,
          approvedByUserId: userId,
          effectiveDate: startDate,
          renewalDate: endDate,
          completedAt: new Date(),
          isActive: true
        }
      })
    ]

    if (oldActive && oldActive.id !== id) {
      ops.push(
        this.prisma.assessment.updateMany({
          where: { id: oldActive.id },
          data: {
            isActive: false,
            supersededAt: new Date(),
            supersededByAssessmentId: id
          }
        })
      )
    }

    // updateMany returns { count }, not the records — fetch full record after
    await this.prisma.$transaction(ops)

    // Fetch full updated assessment with relations
    const refreshed = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        hcp: true,
        submittedByUser: { select: { id: true, email: true } },
        approvedByUser: { select: { id: true, email: true } }
      }
    })

    // Create audit trail entry (with supersession info if applicable)
    const auditAction = oldActive ? 'APPROVE_SUPERSEDED' : 'APPROVE'
    const auditFieldChanged = 'status,tier,rate' + (oldActive ? ',supersession' : '') + (isRateOverride ? ',rateOverride' : '')
    const auditRationale = isRateOverride ? `Rate override: ${rationale}` : rationale

    const baseAudit = {
      userId,
      userName: 'Admin',
      entityType: 'Assessment',
      entityId: id,
      action: auditAction,
      fieldChanged: auditFieldChanged,
      oldValue: JSON.stringify({ status: 'UNDER_REVIEW', tierLabel: existing.tierLabel, rate: existing.rate }),
      newValue: JSON.stringify({ status: 'APPROVED', tierLabel: assignedTierLabel, rate: finalRate, ...(isRateOverride ? { rateOverride: true } : {}) }),
      rationale: auditRationale
    }

    if (oldActive) {
      await this.prisma.auditTrail.create({
        data: {
          ...baseAudit,
          fieldChanged: baseAudit.fieldChanged + ',supersession',
          rationale: `${auditRationale || ''} [Superseded previous assessment ${oldActive.id}]`
        }
      })
    } else {
      await this.prisma.auditTrail.create({ data: baseAudit })
    }

    // Create notification for BU (new assessment approved)
    await this.prisma.notification.create({
      data: {
        userId: existing.submittedByUserId,
        type: 'ASSESSMENT_APPROVED',
        title: `Assessment Approved — ${existing.hcp.firstName} ${existing.hcp.lastName}`,
        message: `Your assessment has been approved. Tier: ${assignedTierLabel}, Rate: $${finalRate?.toFixed(2) || '0.00'}`
      }
    })

    // Notify old assessment's submitter if superseded
    if (oldActive && oldActive.submittedByUserId !== existing.submittedByUserId) {
      await this.prisma.notification.create({
        data: {
          userId: oldActive.submittedByUserId,
          type: 'ASSESSMENT_SUPERSEDED',
          title: `Assessment Superseded — ${existing.hcp.firstName} ${existing.hcp.lastName}`,
          message: `Your previous assessment has been superseded by a newer one (approved on ${refreshed?.submittedAt ? new Date(refreshed.submittedAt).toLocaleDateString() : 'recently'}).` // eslint-disable-line @typescript-eslint/no-unnecessary-condition
        }
      })
    }

    return refreshed
  }

  async rejectWithReason(id: string, reason: string, userId: string, tenantId: string): Promise<Assessment> {
    const existing = await this.prisma.assessment.findFirst({
      where: { id, tenantId },
      include: { hcp: true, submittedByUser: true }
    })

    if (!existing) throw new Error('Assessment not found')
    if (existing.status !== 'UNDER_REVIEW') throw new Error('Only assessments under review can be rejected')

    const updatedAssessment = await this.prisma.assessment.update({
      where: { id },
      data: {
        status: 'REJECTED',
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
    await this.prisma.auditTrail.create({
      data: {
        userId,
        userName: 'Admin',
        entityType: 'Assessment',
        entityId: id,
        action: 'REJECT',
        fieldChanged: 'status,rejectionReason',
        oldValue: JSON.stringify({ status: 'UNDER_REVIEW' }),
        newValue: JSON.stringify({ status: 'REJECTED', rejectionReason: reason.trim() }),
        rationale: reason
      }
    })

    // Create notification for BU
    await this.prisma.notification.create({
      data: {
        userId: existing.submittedByUserId,
        type: 'ASSESSMENT_REJECTED',
        title: `Assessment Rejected — ${existing.hcp.firstName} ${existing.hcp.lastName}`,
        message: reason
      }
    })

    return updatedAssessment
  }
}
