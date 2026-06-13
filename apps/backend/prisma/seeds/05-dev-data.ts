/**
 * Seed script: Rich development data for the FMV app
 *
 * Creates a realistic set of dev data so a fresh database immediately
 * looks like a working product — HCPs, assessments in every lifecycle
 * state, audit trails, notifications, etc.
 *
 * Run: npx tsx prisma/seeds/05-dev-data.ts
 *
 * Prerequisites (run these first):
 *   npx tsx prisma/seeds/01-main.ts
 *   npx tsx prisma/seeds/02-criteria-sets.ts
 *   npx tsx prisma/seeds/03-specialties.ts
 *   npx tsx prisma/seeds/04-tier-rates.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, n)
}

// ── Data pools ───────────────────────────────────────────────────────

const US_FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna',
  'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  'Timothy', 'Deborah', 'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon',
  'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy',
  'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda',
  'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen'
]

const US_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
  'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson',
  'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz'
]

const SPECIALTIES = [
  'Family Medicine', 'Internal Medicine', 'Pediatrics', 'Emergency Medicine',
  'Anesthesiology', 'Obstetrics and Gynecology', 'Diagnostic Radiology',
  'Psychiatry', 'Hospitalist', 'Surgery', 'Cardiology', 'Oncology'
]

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

const CITIES: Record<string, string[]> = {
  CA: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno'],
  NY: ['New York', 'Buffalo', 'Rochester', 'Albany', 'Syracuse'],
  TX: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
  FL: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'],
  IL: ['Chicago', 'Springfield', 'Naperville', 'Peoria'],
  PA: ['Philadelphia', 'Pittsburgh', 'Allentown'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo'],
  default: ['Springfield', 'Franklin', 'Clinton', 'Madison', 'Georgetown']
}

const SUFFIXES = ['', 'MD', 'DO', 'MD, PhD', 'DO, FAAFP']

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const tenantId = 'tenant-001'

  // ── 1. Fetch existing entities ────────────────────────────────────

  const users = await prisma.user.findMany({ where: { tenantId } })
  if (users.length < 3) {
    console.error('❌ Need at least 3 users (SA, Admin, BU). Run seed.ts first.')
    return
  }

  const saUser = users.find(u => u.role === 'SA')!
  const adminUser = users.find(u => u.role === 'ADMIN')!
  const buUser = users.find(u => u.role === 'BU')!

  const specialties = await prisma.specialty.findMany({
    where: { tenantId, isActive: true },
    include: { criteriaSet: true }
  })
  if (specialties.length === 0) {
    console.error('❌ No specialties found. Run seed-top-specialties.ts first.')
    return
  }

  const criteriaSets = await prisma.criteriaSet.findMany({
    where: { tenantId, isActive: true }
  })

  // ── 2. Generate HCPs ─────────────────────────────────────────────

  console.log('\n🏥 Creating HCPs...')
  const hcpIds: string[] = []
  const hcpCount = 60

  for (let i = 0; i < hcpCount; i++) {
    const firstName = randomFrom(US_FIRST_NAMES)
    const lastName = randomFrom(US_LAST_NAMES)
    const specialty = randomFrom(specialties)
    const state = randomFrom(STATES)
    const cities = CITIES[state] || CITIES.default
    const city = randomFrom(cities)

    const hcpId = `hcp-${String(i + 1).padStart(3, '0')}`
    const npi = `1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`

    const hcp = await prisma.hcp.upsert({
      where: { id: hcpId },
      update: {},
      create: {
        id: hcpId,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomFrom(['mail.com', 'gmail.com', 'outlook.com', 'healthcare.org'])}`,
        phone: `(${String(Math.floor(Math.random() * 900) + 100)}) ${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        address: `${Math.floor(Math.random() * 9000) + 100} ${randomFrom(['Main', 'Oak', 'Maple', 'Cedar', 'Pine', 'Elm', 'Park', 'Lake'])} ${randomFrom(['St', 'Ave', 'Blvd', 'Dr', 'Rd'])}`,
        city,
        state,
        country: 'US',
        specialtyId: specialty.id,
        tenantId,
        isActive: Math.random() > 0.1, // 90% active
        createdAt: randomDate(new Date(2023, 0, 1), new Date(2026, 5, 1))
      }
    })

    // Add NPI identifier
    await prisma.hcpIdentifier.upsert({
      where: { hcpId_type_value: { hcpId: hcp.id, type: 'NPI', value: npi } },
      update: {},
      create: {
        id: `id-${hcpId}-npi`,
        hcpId: hcp.id,
        type: 'NPI',
        value: npi
      }
    })

    // Some HCPs get state license too
    if (Math.random() > 0.5) {
      const licenseId = `${state}${String(Math.floor(Math.random() * 900000) + 100000)}`
      await prisma.hcpIdentifier.create({
        data: {
          id: `id-${hcpId}-license`,
          hcpId: hcp.id,
          type: 'State License',
          value: licenseId
        }
      })
    }

    hcpIds.push(hcp.id)
  }

  console.log(`   ✅ Created ${hcpCount} HCPs across ${specialties.length} specialties`)

  // ── 3. Generate Assessments ──────────────────────────────────────

  console.log('\n📋 Creating assessments...')

  const statusPool = [
    'DRAFT', 'SUBMITTED', 'AI_PROCESSING', 'AI_COMPLETE',
    'UNDER_REVIEW', 'APPROVED', 'REJECTED'
  ]

  const assessments: {
    id: string
    hcpId: string
    submittedByUserId: string
    specialtyId: string
    criteriaSetId: string
    status: string
    totalScore: number | null
    tierLabel: string | null
    rate: string | null
    approvedByUserId: string | null
    rejectionReason: string | null
    effectiveDate: Date | null
    renewalDate: Date | null
    createdAt: Date
    submittedAt: Date | null
    completedAt: Date | null
  }[] = []

  // Pre-generate some AI results for approved/rejected assessments
  const aiResultsSamples = [
    JSON.stringify([
      { questionId: '85977830-e6b4-5303-a871-9827606b433d', selectedAnswerId: 'af4a1426-d033-5262-8dd7-a689ff665e92', rationale: 'HCP has 15+ years experience with 10 years in relevant therapeutic area.' },
      { questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a', selectedAnswerId: '1bd623c2-9b10-5e83-95e9-b383c097df78', rationale: 'Board certified in the specialty.' },
      { questionId: '9f6d5116-fb30-5483-8f19-96387882188f', selectedAnswerId: 'd9a1094a-cdf1-5f4a-b4cc-631feabc686c', rationale: 'Full-time staff at teaching hospital.' },
      { questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', selectedAnswerId: '04581a4e-8841-59c4-92d7-0d6176c9d421', rationale: '7 published articles in leading journals.' },
      { questionId: '7793206c-be5f-5d52-a889-6934107cb0b1', selectedAnswerId: 'ed3f2ac4-bb53-5591-a626-0793aeeed6c2', rationale: 'Associate editor for 3 journals.' },
      { questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', selectedAnswerId: '33db111d-b218-5c2f-8859-746172f2e873', rationale: 'PI on 3 multi-centered trials.' },
      { questionId: 'aa25b1e3-60dd-5d19-83d6-b1986cf42faa', selectedAnswerId: '3913beca-e172-5977-a467-9bf03780e786', rationale: 'NIH grant recipient.' },
      { questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', selectedAnswerId: '4195a9d9-cabb-5139-8e69-780c56f054e6', rationale: 'National conference speaker 3 times.' },
      { questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', selectedAnswerId: 'bb08bc07-f3d1-5e64-96f6-db17146fd36d', rationale: 'Committee chair for treatment guidelines.' },
      { questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', selectedAnswerId: '843f5345-dd86-5173-b50f-e1abc76030d9', rationale: 'President of national medical association.' }
    ]),
    JSON.stringify([
      { questionId: '85977830-e6b4-5303-a871-9827606b433d', selectedAnswerId: 'dcc766b4-4f91-587e-bb7d-926510892b35', rationale: 'New graduate, less than 5 years experience.' },
      { questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a', selectedAnswerId: '50ac2798-1a07-5dde-ae3a-a128b14b6f58', rationale: 'Not board certified in specialty.' },
      { questionId: '9f6d5116-fb30-5483-8f19-96387882188f', selectedAnswerId: 'e0c872f6-8994-5dd3-9ace-e4b0b9dfb7eb', rationale: 'Member of general practice.' },
      { questionId: '3e365e20-0e10-5e7f-b786-f54c65570c04', selectedAnswerId: '907d8c28-1512-523c-96a2-8ed2c3c7d3ed', rationale: 'Co-authored a textbook chapter.' },
      { questionId: '7793206c-be5f-5d52-a889-6934107cb0b1', selectedAnswerId: 'ed3f2ac4-bb53-5591-a626-0793aeeed6c2', selectedAnswerId: 'ed3f2ac4-bb53-5591-a626-0793aeeed6c2', rationale: 'Associate editor.' },
      { questionId: 'af4f739a-2464-557b-84b7-4d30e75ac9da', selectedAnswerId: '5e9fff2a-b6b0-5d2b-972e-1b2f60ecd23e', rationale: 'Sub-investigator on 3 trials.' },
      { questionId: 'aa25b1e3-60dd-5d19-83d6-b1986cf42faa', selectedAnswerId: '3913beca-e172-5977-a467-9bf03780e786', rationale: 'Has NIH grant.' },
      { questionId: '20f5ef55-50cd-57bb-a15d-7d629576744e', selectedAnswerId: '4a3eae96-aa76-558a-9caa-b79a3ee7853a', rationale: 'Academic lecturer 6 times.' },
      { questionId: '96610f17-4dc7-5b46-ac94-18c88a598c43', selectedAnswerId: '1d18df20-4b88-5a80-845b-9800d1db793f', rationale: 'Local medical advisory board member.' },
      { questionId: 'a0d586b5-d502-5bec-bd00-e81d52bdc867', selectedAnswerId: '5fbbac6f-8031-5117-8b3a-4530facfc27f', rationale: 'Society member only.' }
    ])
  ]

  // Distribution: 8 DRAFT, 5 SUBMITTED, 3 AI_PROCESSING, 8 AI_COMPLETE,
  // 6 UNDER_REVIEW, 20 APPROVED, 5 REJECTED, 5 AI_FAILED
  const assessmentDistribution = [
    ...Array(8).fill('DRAFT'),
    ...Array(5).fill('SUBMITTED'),
    ...Array(3).fill('AI_PROCESSING'),
    ...Array(8).fill('AI_COMPLETE'),
    ...Array(6).fill('UNDER_REVIEW'),
    ...Array(20).fill('APPROVED'),
    ...Array(5).fill('REJECTED'),
    ...Array(5).fill('AI_FAILED')
  ]

  // Shuffle
  const shuffledStatuses = assessmentDistribution.sort(() => 0.5 - Math.random())

  // Fetch SpecialtyRate entries for rate lookup
  const allRates = await prisma.specialtyRate.findMany({ where: { tenantId } })

  for (let i = 0; i < 60; i++) {
    const status = shuffledStatuses[i]
    const hcpId = hcpIds[i % hcpIds.length]
    const hcp = await prisma.hcp.findUnique({ where: { id: hcpId } })
    const criteriaSet = randomFrom(criteriaSets)
    const specialty = hcp?.specialtyId ? await prisma.specialty.findUnique({ where: { id: hcp!.specialtyId! } }) : randomFrom(specialties)
    const assignedSpecialty = specialty || randomFrom(specialties)

    const now = new Date()
    const submittedAt = randomDate(new Date(2024, 6, 1), now)

    // Determine score, tier, rate based on status
    let totalScore: number | null = null
    let tierLabel: string | null = null
    let rate: string | null = null
    let approvedByUserId: string | null = null
    let rejectionReason: string | null = null
    let effectiveDate: Date | null = null
    let renewalDate: Date | null = null

    if (['APPROVED', 'UNDER_REVIEW', 'REJECTED'].includes(status)) {
      // Pick a score between 5 and 30
      totalScore = Math.floor(Math.random() * 26) + 5

      // Find matching tier from criteria set thresholds
      if (criteriaSet.tierThresholds) {
        const thresholds: Array<{ label: string; minScore: number; maxScore: number }> =
          typeof criteriaSet.tierThresholds === 'string'
            ? JSON.parse(criteriaSet.tierThresholds)
            : criteriaSet.tierThresholds

        const matchingTier = thresholds.find(t => totalScore! >= t.minScore && totalScore! <= t.maxScore)
        if (matchingTier) {
          tierLabel = matchingTier.label

          // Look up rate
          const rateEntry = allRates.find(r =>
            r.specialtyId === assignedSpecialty.id &&
            r.criteriaSetId === criteriaSet.id &&
            r.tierLabel === tierLabel
          )
          if (rateEntry) {
            rate = rateEntry.lowRate
          }
        }
      }

      if (status === 'APPROVED') {
        approvedByUserId = adminUser.id
        const validityDays = 730 // default
        effectiveDate = submittedAt
        renewalDate = new Date(submittedAt.getTime() + validityDays * 24 * 60 * 60 * 1000)
      }

      if (status === 'REJECTED') {
        approvedByUserId = adminUser.id
        rejectionReason = randomFrom([
          'Insufficient documentation to support higher tier.',
          'HCP does not meet minimum criteria for FMV assessment.',
          'CV lacks required professional experience details.',
          'Duplicate submission already under review.',
          'HCP specialty does not match assigned criteria set.'
        ])
      }
    }

    const aiResults = ['APPROVED', 'REJECTED', 'AI_COMPLETE', 'AI_FAILED'].includes(status)
      ? randomFrom(aiResultsSamples)
      : null

    const assessmentId = `asm-${String(i + 1).padStart(3, '0')}`
    const completedAt = ['APPROVED', 'REJECTED', 'AI_COMPLETE', 'AI_FAILED'].includes(status)
      ? new Date(submittedAt.getTime() + (15 + Math.random() * 120) * 60 * 1000)
      : null

    const createdAt = new Date(submittedAt.getTime() - (1 + Math.random() * 72) * 60 * 60 * 1000)

    assessments.push({
      id: assessmentId,
      hcpId,
      submittedByUserId: buUser.id,
      specialtyId: assignedSpecialty.id,
      criteriaSetId: criteriaSet.id,
      status,
      totalScore,
      tierLabel,
      rate,
      approvedByUserId,
      rejectionReason,
      effectiveDate,
      renewalDate,
      createdAt,
      submittedAt,
      completedAt
    })
  }

  // Bulk create assessments
  for (const asm of assessments) {
    await prisma.assessment.upsert({
      where: { id: asm.id },
      update: {},
      create: {
        id: asm.id,
        hcpId: asm.hcpId,
        submittedByUserId: asm.submittedByUserId,
        specialtyId: asm.specialtyId,
        criteriaSetId: asm.criteriaSetId,
        status: asm.status,
        totalScore: asm.totalScore,
        tierLabel: asm.tierLabel,
        rate: asm.rate,
        approvedByUserId: asm.approvedByUserId,
        rejectionReason: asm.rejectionReason,
        tenantId,
        effectiveDate: asm.effectiveDate ?? undefined,
        renewalDate: asm.renewalDate ?? undefined,
        createdAt: asm.createdAt,
        submittedAt: asm.submittedAt ?? undefined,
        completedAt: asm.completedAt ?? undefined,
        aiResults: asm.status === 'AI_FAILED'
          ? JSON.stringify([{ _diagnostic: 'LLM returned unparsable output', rawSnippet: 'Question: 85977830-e6b4-5303-a871-9827606b433d, Answer: a2' }])
          : asm.aiResults
      }
    })
  }

  console.log(`   ✅ Created ${assessments.length} assessments`)

  // Count by status
  const statusCounts = assessments.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log(`   📊 Distribution: ${Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`).join(', ')}`)

  // ── 4. Audit Trails ──────────────────────────────────────────────

  console.log('\n📝 Creating audit trails...')
  const auditEntries: Array<{
    id: string
    userId: string
    userName: string
    entityType: string
    entityId: string
    action: string
    fieldChanged: string | null
    oldValue: string | null
    newValue: string | null
    rationale: string | null
    createdAt: Date
  }> = []

  const actions = ['CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'REVIEW', 'RETRY']

  for (const asm of assessments) {
    if (asm.status === 'DRAFT') continue

    // Creation audit
    auditEntries.push({
      id: `audit-${asm.id}-create`,
      userId: buUser.id,
      userName: buUser.email,
      entityType: 'Assessment',
      entityId: asm.id,
      action: 'CREATE',
      fieldChanged: null,
      oldValue: null,
      newValue: asm.status,
      rationale: null,
      createdAt: asm.createdAt
    })

    if (asm.status === 'APPROVED') {
      auditEntries.push({
        id: `audit-${asm.id}-approve`,
        userId: adminUser.id,
        userName: adminUser.email,
        entityType: 'Assessment',
        entityId: asm.id,
        action: 'APPROVE',
        fieldChanged: 'status',
        oldValue: 'UNDER_REVIEW',
        newValue: 'APPROVED',
        rationale: `Approved at score ${asm.totalScore}, ${asm.tierLabel}, rate $${asm.rate}/hr`,
        createdAt: asm.completedAt!
      })
    }

    if (asm.status === 'REJECTED') {
      auditEntries.push({
        id: `audit-${asm.id}-reject`,
        userId: adminUser.id,
        userName: adminUser.email,
        entityType: 'Assessment',
        entityId: asm.id,
        action: 'REJECT',
        fieldChanged: 'status',
        oldValue: 'UNDER_REVIEW',
        newValue: 'REJECTED',
        rationale: asm.rejectionReason,
        createdAt: asm.completedAt!
      })
    }

    if (asm.status === 'AI_COMPLETE' || asm.status === 'UNDER_REVIEW') {
      auditEntries.push({
        id: `audit-${asm.id}-review`,
        userId: adminUser.id,
        userName: adminUser.email,
        entityType: 'Assessment',
        entityId: asm.id,
        action: 'REVIEW',
        fieldChanged: 'aiResults',
        oldValue: null,
        newValue: `AI score: ${asm.totalScore}`,
        rationale: null,
        createdAt: asm.completedAt || asm.submittedAt!
      })
    }
  }

  await prisma.auditTrail.createMany({
    data: auditEntries
  })

  console.log(`   ✅ Created ${auditEntries.length} audit trail entries`)

  // ── 5. Notifications ─────────────────────────────────────────────

  console.log('\n🔔 Creating notifications...')
  const notifications: Array<{
    id: string
    userId: string
    type: string
    title: string
    message: string
    readAt: Date | null
    createdAt: Date
  }> = []

  for (const asm of assessments) {
    if (asm.status === 'DRAFT') continue

    // BU gets notified on approval/rejection
    if (['APPROVED', 'REJECTED'].includes(asm.status)) {
      const hcp = await prisma.hcp.findUnique({ where: { id: asm.hcpId } })
      const hcpName = hcp ? `${hcp.firstName} ${hcp.lastName}` : 'Unknown HCP'

      notifications.push({
        id: `notif-${asm.id}-bu`,
        userId: buUser.id,
        type: asm.status === 'APPROVED' ? 'approval' : 'rejection',
        title: `Assessment ${asm.status === 'APPROVED' ? 'Approved' : 'Rejected'}: ${hcpName}`,
        message: asm.status === 'APPROVED'
          ? `The assessment for ${hcpName} has been approved as ${asm.tierLabel} at $${asm.rate}/hr. Effective ${asm.effectiveDate?.toLocaleDateString()}.`
          : `The assessment for ${hcpName} was rejected: ${asm.rejectionReason}`,
        readAt: Math.random() > 0.3 ? randomDate(asm.completedAt!, new Date()) : null,
        createdAt: asm.completedAt!
      })
    }

    // Admins/SAs get notified on expiry warnings
    if (asm.status === 'APPROVED' && asm.renewalDate) {
      const daysUntilExpiry = Math.floor((asm.renewalDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry <= 30) {
        const urgency = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 14 ? 'HIGH' : 'NORMAL'
        const hcp = await prisma.hcp.findUnique({ where: { id: asm.hcpId } })
        const hcpName = hcp ? `${hcp.firstName} ${hcp.lastName}` : 'Unknown HCP'

        notifications.push({
          id: `notif-${asm.id}-expiry`,
          userId: adminUser.id,
          type: 'expiry',
          title: `⚠️ ${urgency}: ${hcpName} assessment expiring in ${daysUntilExpiry} days`,
          message: `The assessment for ${hcpName} (${asm.tierLabel}, $${asm.rate}/hr) renews on ${asm.renewalDate?.toLocaleDateString()}.`,
          readAt: null,
          createdAt: asm.renewalDate
        })
      }
    }
  }

  // Add some generic notifications for admins
  notifications.push(
    {
      id: 'notif-system-1',
      userId: adminUser.id,
      type: 'system',
      title: 'System Update',
      message: 'FMV app has been updated with new tier thresholds. Please review the updated criteria.',
      readAt: null,
      createdAt: new Date(2026, 5, 1)
    },
    {
      id: 'notif-system-2',
      userId: saUser.id,
      type: 'system',
      title: 'New Specialty Added',
      message: 'A new specialty has been added to the system. Please link it to a criteria set.',
      readAt: new Date(2026, 5, 5),
      createdAt: new Date(2026, 5, 5)
    }
  )

  await prisma.notification.createMany({
    data: notifications
  })

  console.log(`   ✅ Created ${notifications.length} notifications`)

  // ── Summary ──────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60))
  console.log('🎉 Dev data seed complete!')
  console.log('='.repeat(60))
  console.log(`   HCPs:            ${hcpCount}`)
  console.log(`   Assessments:     ${assessments.length}`)
  console.log(`   Audit trails:    ${auditEntries.length}`)
  console.log(`   Notifications:   ${notifications.length}`)
  console.log(`   Specialties:     ${specialties.length}`)
  console.log(`   Criteria sets:   ${criteriaSets.length}`)
  console.log('')
  console.log('📋 Log in with:')
  console.log(`   SA:  sa@fmv.local / admin123`)
  console.log(`   Admin: admin@fmv.local / admin123`)
  console.log(`   BU:  bu@fmv.local / bu123`)
  console.log('='.repeat(60))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
