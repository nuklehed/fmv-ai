/**
 * Seed script: Top 10 US Physician Specialties
 * 
 * Creates the 10 largest specialties by provider count (Axuall 2025),
 * all linked to the FMV HCP Tiers criteria set.
 * 
 * Run: npx tsx prisma/seed-top-specialties.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tenantId = 'tenant-001'
  const criteriaSetId = 'cs-fmv-tiers'

  // Verify criteria set exists
  const criteriaSet = await prisma.criteriaSet.findUnique({
    where: { id: criteriaSetId }
  })

  if (!criteriaSet) {
    console.error(`❌ Criteria set "${criteriaSetId}" not found. Run seed-fmv-tiers.ts first.`)
    return
  }

  // Top 10 specialties by provider count (Axuall 2025 Clinician Workforce Report)
  const specialties = [
    {
      id: 'spec-family-medicine',
      name: 'Family Medicine',
      description: 'Comprehensive primary care for patients of all ages, focusing on whole-person health across the lifespan.',
      criteriaSetId
    },
    {
      id: 'spec-internal-medicine',
      name: 'Internal Medicine',
      description: 'Specializes in the prevention, diagnosis, and treatment of adult diseases from a holistic perspective.',
      criteriaSetId
    },
    {
      id: 'spec-pediatrics',
      name: 'Pediatrics',
      description: 'Medical care focused on the physical, behavioral, and mental health of infants, children, and adolescents.',
      criteriaSetId
    },
    {
      id: 'spec-emergency-medicine',
      name: 'Emergency Medicine',
      description: 'Diagnoses and treats acute illnesses and injuries requiring immediate medical attention in emergency settings.',
      criteriaSetId
    },
    {
      id: 'spec-anesthesiology',
      name: 'Anesthesiology',
      description: 'Administers anesthesia and manages pain relief for surgical procedures and other medical interventions.',
      criteriaSetId
    },
    {
      id: 'spec-obstetrics-gynecology',
      name: 'Obstetrics and Gynecology',
      description: 'Cares for women\'s reproductive health, pregnancy, childbirth, and disorders of the female reproductive system.',
      criteriaSetId
    },
    {
      id: 'spec-diagnostic-radiology',
      name: 'Diagnostic Radiology',
      description: 'Uses medical imaging technologies such as X-ray, CT, MRI, and ultrasound to diagnose diseases.',
      criteriaSetId
    },
    {
      id: 'spec-psychiatry',
      name: 'Psychiatry',
      description: 'Diagnoses, treats, and prevents mental, emotional, and behavioral disorders through therapy and medication.',
      criteriaSetId
    },
    {
      id: 'spec-hospitalist',
      name: 'Hospitalist',
      description: 'Provides comprehensive medical care to hospitalized patients, coordinating inpatient treatment plans.',
      criteriaSetId
    },
    {
      id: 'spec-surgery',
      name: 'Surgery',
      description: 'Performs operative and procedural interventions to treat diseases, injuries, and deformities across diverse anatomical systems.',
      criteriaSetId
    }
  ]

  // Upsert each specialty (idempotent — skips if already exists)
  for (const spec of specialties) {
    const existing = await prisma.specialty.findUnique({
      where: { id: spec.id, tenantId }
    })

    if (existing) {
      console.log(`⏭️  Skipping "${spec.name}" — already exists`)
      continue
    }

    await prisma.specialty.create({ data: { ...spec, tenantId } })
    console.log(`✅ Created "${spec.name}" → linked to "${criteriaSet.name}"`)
  }

  // Summary
  const count = await prisma.specialty.count({ where: { tenantId, isActive: true } })
  console.log(`\n📋 Total active specialties for tenant: ${count}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
