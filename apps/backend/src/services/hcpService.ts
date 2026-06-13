import { PrismaClient } from '@prisma/client'

export interface CreateHcpInput {
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  specialtyId?: string | null
  identifiers?: Array<{ type: string; value: string }>
  tenantId: string
}

export interface HcpWithWarnings {
  hcp: Record<string, unknown>
  duplicateWarning?: boolean
  duplicateId?: string
}

/**
 * Create an HCP with fuzzy duplicate detection.
 * Shared by both admin POST /api/hcps and BU POST /api/hcps/bu-create.
 */
export async function createHcp(
  input: CreateHcpInput,
  prisma: PrismaClient
): Promise<HcpWithWarnings> {
  const {
    firstName, lastName, email, phone, address, city, state, country,
    specialtyId, identifiers, tenantId
  } = input

  // Validate specialty if provided
  if (specialtyId) {
    const specialty = await prisma.specialty.findFirst({
      where: { id: specialtyId, tenantId, isActive: true, criteriaSetId: { not: null } }
    })
    if (!specialty) {
      throw new Error('Invalid specialty. Must be active and linked to a criteria set.')
    }
  }

  // Fuzzy duplicate detection — check for matching name + any provided external identifiers
  if (identifiers && identifiers.length > 0) {
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
        throw {
          code: 409,
          error: 'Potential duplicate found',
          duplicate: {
            id: existingWithId.id,
            firstName: existingWithId.firstName,
            lastName: existingWithId.lastName,
            identifierType: identifier.type,
            identifierValue: identifier.value
          }
        }
      }
    }
  }

  // Name-only match as warning (non-blocking)
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
      city: city || null,
      state: state || null,
      country: country || 'US',
      specialtyId: specialtyId || null,
      tenantId,
      identifiers: identifiers && identifiers.length > 0 ? {
        create: identifiers.map((id) => ({
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

  const response: HcpWithWarnings = { hcp }
  if (nameOnlyMatch) {
    response.duplicateWarning = true
    response.duplicateId = nameOnlyMatch.id
  }

  return response
}
