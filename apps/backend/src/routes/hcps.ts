import { Router } from 'express'
import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'
import { authenticate, requireAdminOrSA, requireBUOrHigher } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// All HCP routes require authentication; write operations require Admin/SA role
router.use(authenticate)
router.use(requireAdminOrSA)

/**
 * GET /api/hcps
 * List HCPs with search, sort, and pagination (paginated by default for performance)
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
    const search = req.query.search as string | undefined
    const sortField = (req.query.sort as string) || 'lastName'
    const sortOrder = (req.query.order as string) === 'desc' ? 'desc' : 'asc'

    // Multi-tenant isolation
    const where: Record<string, unknown> = { isActive: true }
    if (req.tenantId) {
      where.tenantId = req.tenantId
    }

    // Search across name and identifiers
    if (search && typeof search === 'string' && search.length > 0) {
      const lowerSearch = search.toLowerCase()
      where.OR = [
        { firstName: { contains: lowerSearch } },
        { lastName: { contains: lowerSearch } },
        { email: { contains: lowerSearch } },
        { state: { contains: lowerSearch } },
        {
          identifiers: {
            some: {
              value: { contains: lowerSearch },
              isActive: true
            }
          }
        }
      ] as any
    }

    // Map sort field to Prisma format (handle nested relations)
    const orderByMap: Record<string, string> = {
      firstName: 'firstName',
      lastName: 'lastName',
      state: 'state',
      specialtyName: 'specialty.name',
      createdAt: 'createdAt'
    }

    const prismaSortField = orderByMap[sortField] || 'lastName'

    // Fetch total count for pagination
    const totalCount = await prisma.hcp.count({ where })

    // Fetch paginated results with specialty name and latest identifier
    const hcps = await prisma.hcp.findMany({
      where,
      orderBy: { [prismaSortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        specialty: { select: { id: true, name: true } },
        identifiers: {
          where: { isActive: true },
          take: 1, // Just get the first identifier for display
          select: { type: true, value: true }
        }
      }
    })

    // Flatten specialty relation into specialtyName for API consumers
    const formattedHcps = hcps.map(hcp => ({
      ...hcp,
      specialtyName: hcp.specialty?.name || null,
      specialty: undefined
    }))

    res.json({
      data: formattedHcps,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    })
  } catch (error) {
    console.error('Error fetching HCPs:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/hcps/:id
 * Get a single HCP with full details including identifiers and assessments
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation
    const hcp = await prisma.hcp.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        identifiers: {
          where: { isActive: true }
        },
        specialty: {
          select: { id: true, name: true }
        },
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            totalScore: true,
            rate: true,
            tierId: true,
            submittedAt: true,
            completedAt: true
          }
        }
      }
    })

    if (!hcp) {
      res.status(404).json({ error: 'HCP not found' })
      return
    }

    res.json(hcp)
  } catch (error) {
    console.error('Error fetching HCP:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/hcps
 * Create a new HCP with fuzzy duplicate detection
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phone, address, state, specialtyId, identifiers } = req.body

    if (!firstName || !lastName) {
      res.status(400).json({ error: 'First name and last name are required' })
      return
    }

    // Multi-tenant isolation
    const tenantId = req.tenantId!

    // Fuzzy duplicate detection — check for matching name + any provided external identifiers
    if (identifiers && Array.isArray(identifiers) && identifiers.length > 0) {
      for (const identifier of identifiers) {
        const existingWithId = await prisma.hcp.findFirst({
          where: {
            tenantId,
            isActive: true,
            firstName: { equals: firstName.trim() },
            lastName: { equals: lastName.trim() },
            identifiers: {
              some: {
                value: { equals: identifier.value },
                isActive: true
              }
            }
          }
        })

        if (existingWithId) {
          res.status(409).json({
            error: `Potential duplicate found`,
            duplicate: {
              id: existingWithId.id,
              firstName: existingWithId.firstName,
              lastName: existingWithId.lastName,
              identifierType: identifier.type,
              identifierValue: identifier.value
            }
          })
          return
        }
      }
    }

    // Also check name-only match as a warning (not blocking)
    const nameOnlyMatch = await prisma.hcp.findFirst({
      where: {
        tenantId,
        isActive: true,
        firstName: { equals: firstName.trim() },
        lastName: { equals: lastName.trim() }
      }
    })

    // Create HCP with optional identifiers
    const hcp = await prisma.hcp.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email || null,
        phone: phone || null,
        address: address || null,
        state: state || null,
        specialtyId: specialtyId || null,
        tenantId,
        identifiers: identifiers && Array.isArray(identifiers) ? {
          create: identifiers.map((id: { type: string; value: string }) => ({
            type: id.type as 'NPI' | 'STATE_LICENSE' | 'DEA' | 'OTHER',
            value: id.value.trim()
          }))
        } : undefined
      },
      include: {
        identifiers: true,
        specialty: { select: { id: true, name: true } }
      }
    })

    // Include duplicate warning in response if name-only match found
    const response = hcp as Record<string, unknown> & { duplicateWarning?: boolean }
    if (nameOnlyMatch) {
      response.duplicateWarning = true
      response.duplicateId = nameOnlyMatch.id
    }

    res.status(201).json(response)
  } catch (error) {
    console.error('Error creating HCP:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/hcps/:id
 * Update an existing HCP
 */
router.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params
    const { firstName, lastName, email, phone, address, state, specialtyId, identifiers } = req.body

    // Multi-tenant isolation — verify HCP belongs to user's tenant
    const existing = await prisma.hcp.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      },
      include: {
        identifiers: true,
        specialty: { select: { id: true, name: true } }
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'HCP not found' })
      return
    }

    // Fuzzy duplicate detection — exclude current HCP from check
    if (identifiers && Array.isArray(identifiers)) {
      for (const identifier of identifiers) {
        const existingWithId = await prisma.hcp.findFirst({
          where: {
            id: { not: id },
            tenantId: req.tenantId!,
            isActive: true,
            firstName: { equals: (firstName || existing.firstName).trim() },
            lastName: { equals: (lastName || existing.lastName).trim() },
            identifiers: {
              some: {
                value: { equals: identifier.value },
                isActive: true
              }
            }
          }
        })

        if (existingWithId) {
          res.status(409).json({
            error: `Potential duplicate found`,
            duplicate: {
              id: existingWithId.id,
              firstName: existingWithId.firstName,
              lastName: existingWithId.lastName,
              identifierType: identifier.type,
              identifierValue: identifier.value
            }
          })
          return
        }
      }
    }

    // Build update data — only include fields that were provided
    const updateData: Record<string, unknown> = {}
    if (firstName !== undefined) updateData.firstName = firstName.trim()
    if (lastName !== undefined) updateData.lastName = lastName.trim()
    if (email !== undefined) updateData.email = email || null
    if (phone !== undefined) updateData.phone = phone || null
    if (address !== undefined) updateData.address = address || null
    if (state !== undefined) updateData.state = state || null
    if (specialtyId !== undefined) updateData.specialtyId = specialtyId

    // Handle identifiers replacement — delete old, create new
    if (identifiers && Array.isArray(identifiers)) {
      updateData.identifiers = {
        deleteMany: {}, // Delete all existing active identifiers
        create: identifiers.map((id: { type: string; value: string }) => ({
          type: id.type as 'NPI' | 'STATE_LICENSE' | 'DEA' | 'OTHER',
          value: id.value.trim()
        }))
      }
    }

    const hcp = await prisma.hcp.update({
      where: { id },
      data: updateData,
      include: {
        identifiers: true,
        specialty: { select: { id: true, name: true } }
      }
    })

    res.json(hcp)
  } catch (error) {
    console.error('Error updating HCP:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/hcps/:id
 * Soft-delete an HCP by setting isActive=false
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params

    // Multi-tenant isolation — verify HCP belongs to user's tenant
    const existing = await prisma.hcp.findFirst({
      where: {
        id,
        tenantId: req.tenantId!
      }
    })

    if (!existing) {
      res.status(404).json({ error: 'HCP not found' })
      return
    }

    const hcp = await prisma.hcp.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({ message: 'HCP deactivated', hcp })
  } catch (error) {
    console.error('Error deleting HCP:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/hcps/bu-create
 * Create a new HCP — BU-facing endpoint for assessment creation flow
 */
router.post('/bu-create', authenticate, requireBUOrHigher, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phone, address, state, specialtyId, identifiers } = req.body

    if (!firstName || !lastName) {
      res.status(400).json({ error: 'First name and last name are required' })
      return
    }

    // Multi-tenant isolation
    const tenantId = req.tenantId!

    // Fuzzy duplicate detection — check for matching name + any provided external identifiers
    if (identifiers && Array.isArray(identifiers) && identifiers.length > 0) {
      for (const identifier of identifiers) {
        const existingWithId = await prisma.hcp.findFirst({
          where: {
            tenantId,
            isActive: true,
            firstName: { equals: firstName.trim() },
            lastName: { equals: lastName.trim() },
            identifiers: {
              some: {
                value: { equals: identifier.value },
                isActive: true
              }
            }
          }
        })

        if (existingWithId) {
          res.status(409).json({
            error: `Potential duplicate found`,
            duplicate: {
              id: existingWithId.id,
              firstName: existingWithId.firstName,
              lastName: existingWithId.lastName,
              identifierType: identifier.type,
              identifierValue: identifier.value
            }
          })
          return
        }
      }
    }

    // Also check name-only match as a warning (not blocking)
    const nameOnlyMatch = await prisma.hcp.findFirst({
      where: {
        tenantId,
        isActive: true,
        firstName: { equals: firstName.trim() },
        lastName: { equals: lastName.trim() }
      }
    })

    // Create HCP with optional identifiers
    const hcp = await prisma.hcp.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email || null,
        phone: phone || null,
        address: address || null,
        state: state || null,
        specialtyId: specialtyId || null,
        tenantId,
        identifiers: identifiers && Array.isArray(identifiers) ? {
          create: identifiers.map((id: { type: string; value: string }) => ({
            type: id.type as 'NPI' | 'STATE_LICENSE' | 'DEA' | 'OTHER',
            value: id.value.trim()
          }))
        } : undefined
      },
      include: {
        identifiers: true,
        specialty: { select: { id: true, name: true } }
      }
    })

    // Include duplicate warning in response if name-only match found
    const response = hcp as Record<string, unknown> & { duplicateWarning?: boolean }
    if (nameOnlyMatch) {
      response.duplicateWarning = true
      response.duplicateId = nameOnlyMatch.id
    }

    res.status(201).json(response)
  } catch (error) {
    console.error('Error creating HCP:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
