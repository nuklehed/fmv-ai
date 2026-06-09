interface Hcp {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  country?: string
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

interface HcpIdentifier {
  id: string
  hcpId: string
  type: 'NPI' | 'STATE_LICENSE' | 'DEA' | 'OTHER'
  value: string
  isActive: boolean
}

enum AssessmentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  AI_PROCESSING = 'AI_PROCESSING',
  AI_COMPLETE = 'AI_COMPLETE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
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
  tierLabel?: string | null
  rate?: number | null
  approvedByUserId?: string | null
  rejectionReason?: string | null
  tenantId: string
  effectiveDate?: string | null
  renewalDate?: string | null
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  completedAt?: string | null
}

export interface CriteriaSet {
  id: string
  name: string
  description?: string | null
  tierThresholds?: Array<{ label: string; minScore: number; maxScore: number }>
  isActive: boolean
  tenantId: string
}

export interface Specialty {
  id: string
  name: string
  description?: string
  criteriaSetId?: string
  criteriaSet?: { id: string; name: string } | null
  isActive: boolean
  tenantId: string
  createdAt: string
  updatedAt: string
}



enum NotificationType {
  ASSESSMENT_APPROVED = 'ASSESSMENT_APPROVED',
  ASSESSMENT_REJECTED = 'ASSESSMENT_REJECTED',
  EXPIRY_REMINDER = 'EXPIRY_REMINDER'
}

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  readAt: string | null
  createdAt: string
}

export interface SpecialtyRate {
  id: string
  specialtyId: string
  criteriaSetId: string
  tierLabel: string
  lowRate: string
  highRate: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

export interface ApplicationSetting {
  id: string
  key: string
  value: Record<string, unknown> | null
  description?: string
  tenantId: string
  userId?: string
  updatedAt: string
}
