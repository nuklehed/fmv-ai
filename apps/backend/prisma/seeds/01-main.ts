import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const tenantId = 'tenant-001'
  
  // Create default SA user
  const saPasswordHash = await bcrypt.hash('admin123', 12)
  const adminPasswordHash = await bcrypt.hash('admin123', 12)
  const buPasswordHash = await bcrypt.hash('bu123', 12)

  const saUser = await prisma.user.upsert({
    where: { email: 'sa@fmv.local' },
    update: {},
    create: {
      id: 'user-sa-001',
      email: 'sa@fmv.local',
      passwordHash: saPasswordHash,
      role: 'SA',
      tenantId,
      isActive: true,
      emailVerified: true
    }
  })

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@fmv.local' },
    update: {},
    create: {
      id: 'user-admin-001',
      email: 'admin@fmv.local',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      tenantId,
      isActive: true,
      emailVerified: true
    }
  })

  const buUser = await prisma.user.upsert({
    where: { email: 'bu@fmv.local' },
    update: {},
    create: {
      id: 'user-bu-001',
      email: 'bu@fmv.local',
      passwordHash: buPasswordHash,
      role: 'BU',
      tenantId,
      isActive: true,
      emailVerified: true
    }
  })

  // Create default specialty if none exists
  const existingSpecialty = await prisma.specialty.findFirst({ where: { name: 'Cardiology' } })
  if (!existingSpecialty) {
    await prisma.specialty.create({
      data: {
        id: 'spec-cardio',
        name: 'Cardiology',
        description: 'Heart and cardiovascular system specialists',
        tenantId,
        isActive: true
      }
    })
  }

  const existingSpecialty2 = await prisma.specialty.findFirst({ where: { name: 'Oncology' } })
  if (!existingSpecialty2) {
    await prisma.specialty.create({
      data: {
        id: 'spec-oncology',
        name: 'Oncology',
        description: 'Cancer treatment specialists',
        tenantId,
        isActive: true
      }
    })
  }

  // Create default criteria set with sample questions if none exists
  const existingCriteriaSet = await prisma.criteriaSet.findFirst({ where: { name: 'Prescriber Evaluation' } })
  if (!existingCriteriaSet) {
    const cs = await prisma.criteriaSet.create({
      data: {
        id: 'cs-prescriber',
        name: 'Prescriber Evaluation',
        description: 'Standard evaluation for prescriber HCPs',
        tenantId,
        isActive: true,
        systemPrompt: `You are an expert evaluator for FMV assessments of healthcare professionals. Review the CV and select the best answer for each question.`
      }
    })

    // Create sample questions and answers
    await prisma.question.createMany({
      data: [
        {
          id: 'q1',
          criteriaSetId: cs.id,
          text: 'What is the HCP\'s primary area of clinical practice?',
          order: 1
        },
        {
          id: 'q2',
          criteriaSetId: cs.id,
          text: 'How many years of post-graduate experience does the HCP have?',
          order: 2
        }
      ]
    })

    await prisma.answer.createMany({
      data: [
        // Q1 answers
        { id: 'a1', questionId: 'q1', text: 'Primary Care / General Practice', score: 1, order: 1 },
        { id: 'a2', questionId: 'q1', text: 'Specialist (non-prescriber)', score: 3, order: 2 },
        { id: 'a3', questionId: 'q1', text: 'Prescriber / Specialist with prescribing authority', score: 5, order: 3 },
        // Q2 answers
        { id: 'a4', questionId: 'q2', text: 'Less than 2 years', score: 1, order: 1 },
        { id: 'a5', questionId: 'q2', text: '2-5 years', score: 3, order: 2 },
        { id: 'a6', questionId: 'q2', text: 'More than 5 years', score: 5, order: 3 }
      ]
    })

    // Link active specialties to this criteria set (if not already linked)
    const specialties = await prisma.specialty.findMany({ where: { tenantId, isActive: true } })
    for (const specialty of specialties) {
      if (!specialty.criteriaSetId) {
        await prisma.specialty.update({
          where: { id: specialty.id },
          data: { criteriaSetId: cs.id }
        })
      }
    }

    // Create tier rate entries for this criteria set (same tiers as FMV)
    const tierRates = [
      { tierLabel: 'Tier 1', lowRate: 445, highRate: 645 },
      { tierLabel: 'Tier 2', lowRate: 245, highRate: 445 },
      { tierLabel: 'Tier 3', lowRate: 50, highRate: 245 }
    ]
    for (const specialty of specialties) {
      for (const tier of tierRates) {
        const existing = await prisma.specialtyRate.findFirst({
          where: { specialtyId: specialty.id, criteriaSetId: cs.id, tierLabel: tier.tierLabel }
        })
        if (!existing) {
          await prisma.specialtyRate.create({
            data: { specialtyId: specialty.id, criteriaSetId: cs.id, tierLabel: tier.tierLabel, lowRate: tier.lowRate, highRate: tier.highRate, tenantId }
          })
        }
      }
    }
  }

  // Create default application settings if none exist
  await prisma.applicationSetting.upsert({
    where: { key_tenantId: { key: 'approvalValidityPeriod', tenantId } },
    update: {},
    create: {
      id: 'setting-validity',
      key: 'approvalValidityPeriod',
      value: JSON.stringify(730), // 2 years
      description: 'Approval validity period in days',
      tenantId
    }
  })

  await prisma.applicationSetting.upsert({
    where: { key_tenantId: { key: 'expiryReminderLeadTime', tenantId } },
    update: {},
    create: {
      id: 'setting-reminder',
      key: 'expiryReminderLeadTime',
      value: JSON.stringify(30), // 30 days
      description: 'Expiry reminder lead time in days',
      tenantId
    }
  })

  console.log('✅ Seed complete!')
  console.log('\n📋 Default users:')
  console.log(`   SA:     sa@fmv.local / admin123`)
  console.log(`   Admin:  admin@fmv.local / admin123`)
  console.log(`   BU:     bu@fmv.local / bu123`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
