import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { createAdminRouter } from './saRouter'

const router = createAdminRouter()
const prisma = new PrismaClient()

/**
 * GET /api/tiers
 * Returns tier rate matrix grouped by specialty, with dynamic columns
 * based on the criteria set's tier thresholds.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId } = req.query

    // Get all active specialties for this tenant
    const specialties = await prisma.specialty.findMany({
      where: { tenantId: req.tenantId!, isActive: true },
      select: { id: true, name: true }
    })

    if (specialties.length === 0) {
      res.json({ data: [], pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 0 } })
      return
    }

    // Get criteria set thresholds if specified
    let tierLabels: string[] = []
    if (criteriaSetId) {
      const cs = await prisma.criteriaSet.findFirst({
        where: { id: criteriaSetId as string, tenantId: req.tenantId! }
      })
      if (cs?.tierThresholds) {
        const thresholds: any[] = JSON.parse(JSON.stringify(cs.tierThresholds))
        tierLabels = thresholds.map((t: any) => t.label)
      }
    }

    // Get all specialty rates for this tenant
    const rates = await prisma.specialtyRate.findMany({
      where: {
        tenantId: req.tenantId!,
        ...(criteriaSetId ? { criteriaSetId: criteriaSetId as string } : {}),
        specialty: { isActive: true }
      },
      include: {
        specialty: { select: { id: true, name: true } },
        criteriaSet: { select: { id: true, name: true } }
      }
    })

    // Group rates by specialty
    const specialtyRatesMap = new Map<string, Record<string, { lowRate: string; highRate: string }>>()
    for (const rate of rates) {
      if (!specialtyRatesMap.has(rate.specialtyId)) {
        specialtyRatesMap.set(rate.specialtyId, {})
      }
      specialtyRatesMap.get(rate.specialtyId)![rate.tierLabel] = {
        lowRate: rate.lowRate,
        highRate: rate.highRate
      }
    }

    // Build matrix rows
    const data = specialties.map(specialty => {
      const row: any = { id: specialty.id, name: specialty.name }
      const ratesForSpecialty = specialtyRatesMap.get(specialty.id) || {}

      for (const label of tierLabels) {
        const rateData = ratesForSpecialty[label]
        if (rateData) {
          row[label] = `$${rateData.lowRate}–$${rateData.highRate}`
        } else {
          row[label] = null
        }
      }

      return row
    })

    res.json({ data, pagination: { page: 1, limit: data.length, totalCount: data.length, totalPages: 1 } })
  } catch (error) {
    console.error('Error fetching tier matrix:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/tiers/thresholds/:criteriaSetId
 * Returns tier thresholds for a criteria set (for approval dropdown)
 */
router.get('/thresholds/:criteriaSetId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { criteriaSetId } = req.params

    const criteriaSet = await prisma.criteriaSet.findFirst({
      where: { id: criteriaSetId, tenantId: req.tenantId! }
    })

    if (!criteriaSet) {
      res.status(404).json({ error: 'Criteria set not found' })
      return
    }

    const thresholds: any[] = criteriaSet.tierThresholds ? JSON.parse(JSON.stringify(criteriaSet.tierThresholds)) : []

    res.json({ labels: thresholds.map((t: any) => t.label), thresholds })
  } catch (error) {
    console.error('Error fetching tier thresholds:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/tiers
 * Create a specialty rate entry
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { specialtyId, criteriaSetId, tierLabel, lowRate, highRate } = req.body

    if (!specialtyId || !criteriaSetId || !tierLabel || lowRate === undefined || highRate === undefined) {
      res.status(400).json({ error: 'All fields are required' })
      return
    }

    // Validate specialty and criteria set belong to tenant
    const [specialty, criteriaSet] = await Promise.all([
      prisma.specialty.findFirst({ where: { id: specialtyId, tenantId: req.tenantId! } }),
      prisma.criteriaSet.findFirst({ where: { id: criteriaSetId, tenantId: req.tenantId! } })
    ])

    if (!specialty) { res.status(404).json({ error: 'Specialty not found' }); return }
    if (!criteriaSet) { res.status(404).json({ error: 'Criteria set not found' }); return }

    // Validate rate range
    if (lowRate > highRate) {
      res.status(400).json({ error: 'Low rate must be less than or equal to high rate' })
      return
    }

    const existing = await prisma.specialtyRate.findFirst({
      where: { specialtyId, criteriaSetId, tierLabel }
    })

    if (existing) {
      res.status(409).json({ error: 'Rate already exists for this specialty/criteria set/tier combination' })
      return
    }

    const rate = await prisma.specialtyRate.create({
      data: {
        specialtyId,
        criteriaSetId,
        tierLabel,
        lowRate: String(lowRate),
        highRate: String(highRate),
        tenantId: req.tenantId!
      },
      include: {
        specialty: { select: { id: true, name: true } },
        criteriaSet: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(rate)
  } catch (error) {
    console.error('Error creating specialty rate:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/tiers/:id
 * Update a specialty rate entry
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { tierLabel, lowRate, highRate } = req.body

    // Verify existing record belongs to tenant
    const existing = await prisma.specialtyRate.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { specialty: true, criteriaSet: true }
    })

    if (!existing) { res.status(404).json({ error: 'Specialty rate not found' }); return }

    // Validate rate range if provided
    if (lowRate !== undefined && highRate !== undefined && lowRate > highRate) {
      res.status(400).json({ error: 'Low rate must be less than or equal to high rate' })
      return
    }

    const updateData: Record<string, unknown> = {}
    if (tierLabel !== undefined) updateData.tierLabel = tierLabel
    if (lowRate !== undefined) updateData.lowRate = String(lowRate)
    if (highRate !== undefined) updateData.highRate = String(highRate)

    const updated = await prisma.specialtyRate.update({
      where: { id },
      data: updateData,
      include: {
        specialty: { select: { id: true, name: true } },
        criteriaSet: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    console.error('Error updating specialty rate:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/tiers/:id
 * Delete a specialty rate entry
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    const existing = await prisma.specialtyRate.findFirst({
      where: { id, tenantId: req.tenantId! }
    })

    if (!existing) { res.status(404).json({ error: 'Specialty rate not found' }); return }

    await prisma.specialtyRate.delete({ where: { id } })
    res.json({ message: 'Specialty rate deleted successfully' })
  } catch (error) {
    console.error('Error deleting specialty rate:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/tiers/specialties/:specialtyId/criteria-sets/:criteriaSetId/rates
 * Get all rates — use specialtyId='_all' for all specialties, or a specific ID for one
 */
router.get('/specialties/:specialtyId/criteria-sets/:criteriaSetId/rates', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { specialtyId, criteriaSetId } = req.params

    const rates = await prisma.specialtyRate.findMany({
      where: {
        ...(specialtyId !== '_all' ? { specialtyId } : {}),
        criteriaSetId,
        tenantId: req.tenantId!
      },
      include: {
        specialty: { select: { id: true, name: true } },
        criteriaSet: { select: { id: true, name: true } }
      },
      orderBy: [{ tierLabel: 'asc' }, { specialtyId: 'asc' }]
    })

    res.json({ data: rates })
  } catch (error) {
    console.error('Error fetching specialty rates:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
