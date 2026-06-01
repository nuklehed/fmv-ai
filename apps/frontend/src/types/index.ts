export interface Hcp {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
  state?: string
  specialtyId?: string
  specialtyName?: string
  tier?: number | null
  rate?: number | null
  status?: AssessmentStatus
  effectiveDate?: string | null
  renewalDate?: string | null
  createdAt: string
  updatedAt: string
}

export interface HcpIdentifier {
  id: string
  hcpId: string
  type: 'NPI' | 'STATE_LICENSE' | 'DEA' | 'OTHER'
  value: string
  isActive: boolean
}

export enum AssessmentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  AI_PROCESSING = 'AI_PROCESSING',
  AI_COMPLETE = 'AI_COMPLETE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export interface Assessment {
  id: string
  hcpId: string
  submittedByUserId: string
  specialtyId?: string
  criteriaSetId?: string
  cvText?: string
  status: AssessmentStatus
  aiResults?: Record<string, unknown> | null
  totalScore?: number | null
  tierId?: string | null
  rate?: number | null
  approvedByUserId?: string | null
  rejectionReason?: string | null
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  completedAt?: string | null
}

export interface Specialty {
  id: string
  name: string
  description?: string
  isActive: boolean
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  email: string
  role: 'BU' | 'ADMIN' | 'SA'
  tenantId: string
  isActive: boolean
  emailVerified: boolean
  createdAt: string
  updatedAt: string
}
