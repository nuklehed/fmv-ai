interface Hcp {
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
  tierId?: string | null
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

export interface Specialty {
  id: string
  name: string
  description?: string
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

export interface Tier {
  id: string
  name: string
  minScore: number
  maxScore: number
  specialtyId: string
  lowRate: number
  highRate: number
  defaultPercentile: number
  tenantId: string
  isActive: boolean
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
