/**
 * Seed script: Tiers for all specialties (except Cardiology)
 * 
 * Creates 3 tiers per specialty with contiguous rate ranges:
 *   Tier 1 (22-35 pts): $445 - $645  (highest)
 *   Tier 2 (11-21 pts): $245 - $445  (mid)
 *   Tier 3 (1-10 pts):  $50 - $245   (lowest)
 * 
 * Run: npx tsx prisma/seed-tiers.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenantId = 'tenant-001'

  // Fetch all active specialties except Cardiology
  const specialties = await prisma.specialty.findMany({
    where: { tenantId, isActive: true, name: { not: 'Cardiology' } }
  })

  if (specialties.length === 0) {
    console.error('❌ No active specialties found. Run seed-top-specialties.ts first.')
    return
  }

  // Tier definitions — contiguous rate ranges rounded to nearest $5
  const tierDefs = [
    { name: 'Tier 1', minScore: 22, maxScore: 35, lowRate: '445', highRate: '645' },
    { name: 'Tier 2', minScore: 11, maxScore: 21, lowRate: '245', highRate: '445' },
    { name: 'Tier 3', minScore: 1,  maxScore: 10, lowRate: '50',  highRate: '245' }
  ]

  let created = 0
  let skipped = 0

  for (const specialty of specialties) {
    // Check if tiers already exist for this specialty
    const existingCount = await prisma.tier.count({
      where: { specialtyId: specialty.id, tenantId }
    })

    if (existingCount > 0) {
      console.log(`⏭️  "${specialty.name}" — ${existingCount} tier(s) already exist, skipping`)
      skipped += 3
      continue
    }

    for (const tierDef of tierDefs) {
      await prisma.tier.create({
        data: {
          id: `tier-${specialty.id.replace('spec-', '')}-${tierDef.name.toLowerCase().replace(' ', '-')}`,
          name: `${specialty.name} — ${tierDef.name}`,
          minScore: tierDef.minScore,
          maxScore: tierDef.maxScore,
          specialtyId: specialty.id,
          lowRate: tierDef.lowRate,
          highRate: tierDef.highRate,
          defaultPercentile: 50,
          tenantId
        }
      })
      created++
    }

    console.log(`✅ "${specialty.name}" — 3 tiers created (score ${tierDefs[2].minScore}-${tierDefs[0].maxScore}, rates $${tierDefs[2].lowRate}–$${tierDefs[0].highRate})`)
  }

  // Summary by specialty
  console.log('\n📋 Tier summary:')
  const tiers = await prisma.tier.findMany({
    where: { tenantId },
    include: { specialty: true },
    orderBy: [{ specialtyId: 'asc' }, { minScore: 'desc' }]
  })

  let currentSpecialty = ''
  for (const tier of tiers) {
    if (tier.specialty?.name !== currentSpecialty) {
      currentSpecialty = tier.specialty?.name ?? 'Unknown'
      console.log(`\n  ${currentSpecialty}:`)
    }
    console.log(`    ${tier.name} → score ${tier.minScore}-${tier.maxScore}, rate $${tier.lowRate}–$${tier.highRate}`)
  }

  console.log(`\n✅ Total tiers created: ${created} (skipped: ${skipped})`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
