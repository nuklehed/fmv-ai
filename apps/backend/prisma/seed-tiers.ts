/**
 * Seed script: Create SpecialtyRate entries and CriteriaSet.tierThresholds
 * 
 * For each specialty (except Cardiology), creates:
 * - Tier thresholds on the criteria set (Tier 1, 2, 3 score ranges)
 * - SpecialtyRate entries with rate ranges per tier
 * 
 * Run: npx tsx prisma/seed-tiers.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenantId = 'tenant-001'

  // Fetch all active specialties except Cardiology
  const specialties = await prisma.specialty.findMany({
    where: { tenantId, isActive: true, name: { not: 'Cardiology' } },
    include: { criteriaSet: true }
  })

  if (specialties.length === 0) {
    console.error('❌ No active specialties found. Run seed-top-specialties.ts first.')
    return
  }

  // Tier definitions — contiguous rate ranges rounded to nearest $5
  const tierDefs = [
    { label: 'Tier 1', minScore: 22, maxScore: 35, lowRate: '445', highRate: '645' },
    { label: 'Tier 2', minScore: 11, maxScore: 21, lowRate: '245', highRate: '445' },
    { label: 'Tier 3', minScore: 1,  maxScore: 10, lowRate: '50',  highRate: '245' }
  ]

  let ratesCreated = 0
  let thresholdsUpdated = 0

  for (const specialty of specialties) {
    if (!specialty.criteriaSetId) {
      console.log(`⏭️  "${specialty.name}" — no criteria set linked, skipping`)
      continue
    }

    const csId = specialty.criteriaSetId

    // Check if SpecialtyRate entries already exist
    const existingCount = await prisma.specialtyRate.count({
      where: { specialtyId: specialty.id, criteriaSetId: csId, tenantId }
    })

    if (existingCount > 0) {
      console.log(`⏭️  "${specialty.name}" — ${existingCount} rate(s) already exist, skipping`)
      continue
    }

    // Create SpecialtyRate entries for this specialty
    for (const tierDef of tierDefs) {
      await prisma.specialtyRate.create({
        data: {
          specialtyId: specialty.id,
          criteriaSetId: csId,
          tierLabel: tierDef.label,
          lowRate: tierDef.lowRate,
          highRate: tierDef.highRate,
          tenantId
        }
      })
      ratesCreated++
    }

    console.log(`✅ "${specialty.name}" — ${tierDefs.length} SpecialtyRate entries created`)
  }

  // Update criteria sets with tierThresholds if not already set
  const criteriaSets = await prisma.criteriaSet.findMany({
    where: { tenantId, isActive: true }
  })

  for (const cs of criteriaSets) {
    if (cs.tierThresholds) continue

    // Use the same tier definitions for all criteria sets
    await prisma.criteriaSet.update({
      where: { id: cs.id },
      data: { tierThresholds: tierDefs }
    })
    thresholdsUpdated++
  }

  console.log(`\n📋 Summary:`)
  console.log(`   SpecialtyRate entries created: ${ratesCreated}`)
  console.log(`   CriteriaSets with thresholds: ${thresholdsUpdated}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
