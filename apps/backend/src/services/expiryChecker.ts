import { PrismaClient, AssessmentStatus } from '@prisma/client'
import cron from 'node-cron'

/**
 * Expiry Checker Service
 * Runs daily to check for assessments approaching their renewal date.
 * Creates notifications and sends emails for matching assessments.
 */

export function startExpiryChecker(prisma: PrismaClient): { stop: () => void } {
  // Default: run daily at 8 AM
  const cronExpression = process.env.EXPIRY_CHECKER_CRON || '0 8 * * *'

  console.log(`⏰ Expiry checker scheduled: ${cronExpression}`)

  const job = cron.schedule(cronExpression, async () => {
    try {
      await checkExpiringAssessments(prisma)
    } catch (error) {
      console.error('Error in expiry checker:', error)
    }
  })

  return { stop: () => job.stop() }
}

async function checkExpiringAssessments(prisma: PrismaClient): Promise<void> {
  console.log('🔍 Checking for assessments approaching expiry...')

  // Get the expiry reminder lead time from application settings (default 30 days)
  const setting = await prisma.applicationSetting.findFirst({
    where: { key: 'expiryReminderLeadTime' }
  })
  const leadTimeDays = setting ? Number(setting.value) : 30

  // Calculate the date range for expiring assessments
  const now = new Date()
  const expiryStart = new Date(now)
  expiryStart.setDate(expiryStart.getDate()) // from today
  const expiryEnd = new Date(now)
  expiryEnd.setDate(expiryEnd.getDate() + leadTimeDays)

  // Find approved assessments approaching expiry
  const expiringAssessments = await prisma.assessment.findMany({
    where: {
      status: AssessmentStatus.APPROVED,
      renewalDate: {
        gte: expiryStart,
        lte: expiryEnd
      }
    },
    include: {
      hcp: true,
      submittedByUser: true,
      tier: { select: { name: true } }
    }
  })

  if (expiringAssessments.length === 0) {
    console.log('✅ No assessments approaching expiry')
    return
  }

  console.log(`📧 Found ${expiringAssessments.length} assessment(s) approaching expiry`)

  for (const assessment of expiringAssessments) {
    const daysUntilExpiry = Math.ceil(
      (assessment.renewalDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Determine urgency level
    let urgencyLevel: string
    if (daysUntilExpiry <= 7) {
      urgencyLevel = 'URGENT'
    } else if (daysUntilExpiry <= 14) {
      urgencyLevel = 'HIGH'
    } else {
      urgencyLevel = 'NORMAL'
    }

    // Create in-app notification for the BU who submitted
    await prisma.notification.create({
      data: {
        userId: assessment.submittedByUserId,
        type: 'EXPIRY_REMINDER',
        title: `Assessment Expiring Soon — ${assessment.hcp.firstName} ${assessment.hcp.lastName}`,
        message: `${urgencyLevel}: The assessment for ${assessment.hcp.firstName} ${assessment.hcp.lastName} (Tier: ${assessment.tier?.name || 'N/A'}) expires on ${assessment.renewalDate!.toLocaleDateString()}. Please submit a renewal assessment.`
      }
    })

    // Also notify all Admins and SAs in the tenant
    const adminUsers = await prisma.user.findMany({
      where: {
        tenantId: assessment.tenantId,
        role: { in: ['ADMIN', 'SA'] as any },
        isActive: true
      }
    })

    for (const admin of adminUsers) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'EXPIRY_REMINDER',
          title: `Assessment Expiring Soon — ${assessment.hcp.firstName} ${assessment.hcp.lastName}`,
          message: `${urgencyLevel}: The assessment for ${assessment.hcp.firstName} ${assessment.hcp.lastName} (Tier: ${assessment.tier?.name || 'N/A'}) expires on ${assessment.renewalDate!.toLocaleDateString()}.`
        }
      })
    }

    // TODO: Send email notifications when SMTP is configured
    console.log(`  📧 Notification created for HCP: ${assessment.hcp.firstName} ${assessment.hcp.lastName} (expires in ${daysUntilExpiry} days)`)
  }

  console.log(`✅ Expiry check complete — ${expiringAssessments.length} notification(s) sent`)
}
