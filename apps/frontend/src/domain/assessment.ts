// ─── Domain Types ──────────────────────────────────────────────────

export interface AssessmentListItem {
  id: string
  hcp: { firstName: string; lastName: string; email?: string }
  submittedByUser: { id: string; email: string }
  specialtyId?: string | null
  criteriaSetId?: string | null
  status: string
  cvText?: string | null
  aiResults?: unknown | null
  totalScore?: number | null
  tierId?: string | null
  rate?: number | null
  approvedByUserId?: string | null
  rejectionReason?: string | null
  effectiveDate?: string | null
  renewalDate?: string | null
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  completedAt?: string | null
  tier?: { name: string; lowRate: number; highRate: number } | null
}

export interface AssessmentDetail extends Omit<AssessmentListItem, 'hcp'> {
  hcpId: string
  hcp: any
  specialty?: { id: string; name: string }
  criteriaSet?: any
  approvedByUser?: { id: string; email: string }
}

export interface AiResultItem {
  questionId: string
  selectedAnswerId: string
  rationale: string
  isOverride?: boolean
  overriddenBy?: string
  overriddenAt?: string
  questionText?: string
  selectedAnswerText?: string
  score?: number
}

export interface ReviewOverride {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

export interface ListParams {
  page: number
  limit: number
  search?: string
  statusFilter?: string
}

export interface ListResult {
  data: AssessmentListItem[]
  pagination: { page: number; limit: number; totalCount: number; totalPages: number }
}

// ─── Status Display Helpers ────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  AI_PROCESSING: 'bg-yellow-100 text-yellow-800',
  AI_COMPLETE: 'bg-purple-100 text-purple-800',
  UNDER_REVIEW: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800'
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  AI_PROCESSING: 'AI Processing',
  AI_COMPLETE: 'AI Complete',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
}

export const StatusColors = STATUS_COLORS
export const StatusLabels = STATUS_LABELS

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-800'
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] || status
}

// ─── Status Transition Rules ──────────────────────────────────────

/** Check if assessment is in DRAFT state */
export function isDraft(assessment: AssessmentListItem): boolean {
  return assessment.status === 'DRAFT'
}

/** Check if assessment can be reviewed (AI_COMPLETE + admin/SA) */
export function canReview(assessment: AssessmentListItem, userRole?: string): boolean {
  return assessment.status === 'AI_COMPLETE' && isAdminOrSA(userRole)
}

/** Check if assessment can be approved (UNDER_REVIEW + admin/SA) */
export function canApprove(assessment: AssessmentListItem, userRole?: string): boolean {
  return assessment.status === 'UNDER_REVIEW' && isAdminOrSA(userRole)
}

/** Check if assessment can be rejected (UNDER_REVIEW + admin/SA) */
export function canReject(assessment: AssessmentListItem, userRole?: string): boolean {
  return assessment.status === 'UNDER_REVIEW' && isAdminOrSA(userRole)
}

function isAdminOrSA(role?: string): boolean {
  return role === 'ADMIN' || role === 'SA'
}

/** Check if the given user ID matches the current logged-in user */
export function isCurrentUser(userId: string | null | undefined): boolean {
  const currentId = localStorage.getItem('userId')
  return userId !== null && userId !== undefined && currentId !== null && userId === currentId
}

/** Check if current user has Admin or SA role */
export function isAdminOrSAUser(): boolean {
  const role = localStorage.getItem('userRole')
  return role === 'ADMIN' || role === 'SA'
}

/** Check if assessment needs admin/SA review (AI_COMPLETE) */
export function isActionRequired(assessment: AssessmentListItem): boolean {
  return assessment.status === 'AI_COMPLETE'
}

// ─── Date Formatting ──────────────────────────────────────────────

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

// ─── AI Results Helpers ───────────────────────────────────────────

/** Cast aiResults to AiResultItem[] for template use */
export function getAiResults(assessment: AssessmentListItem): AiResultItem[] {
  if (!assessment.aiResults) return []
  return assessment.aiResults as unknown as AiResultItem[]
}

// ─── API Operations (backend calls) ──────────────────────────────

function authHeaders(extra?: HeadersInit, skipContentType = false): HeadersInit {
  const token = localStorage.getItem('accessToken')
  const h: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  if (!skipContentType) h['Content-Type'] = 'application/json'
  return { ...h, ...extra }
}

function authHeadersFormData(): HeadersInit {
  const token = localStorage.getItem('accessToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Fetch paginated assessments with search and status filter */
export async function fetchAssessments(params: ListParams): Promise<ListResult> {
  const queryParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...(params.search ? { search: params.search } : {}),
    ...(params.statusFilter ? { status: params.statusFilter } : {})
  })

  const response = await fetch(`/api/assessments?${queryParams}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(`Failed to fetch assessments: ${response.statusText}`)
  return response.json() as Promise<ListResult>
}

/** Fetch a single assessment by ID */
export async function fetchAssessment(id: string): Promise<AssessmentDetail> {
  const response = await fetch(`/api/assessments/${id}`, { headers: authHeaders() })
  if (!response.ok) throw new Error(`Failed to load assessment: ${response.statusText}`)
  return response.json() as Promise<AssessmentDetail>
}

/** Create a new draft assessment */
export async function createDraft(hcpId: string, specialtyId?: string | null, criteriaSetId?: string | null): Promise<any> {
  const response = await fetch('/api/assessments', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ hcpId, specialtyId, criteriaSetId })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to create assessment' }))
    throw new Error(errorData.error || 'Failed to create assessment')
  }

  return response.json()
}

/** Upload CV PDF for an existing draft */
export async function uploadCv(assessmentId: string, file: File): Promise<{ textLength: number }> {
  const formData = new FormData()
  formData.append('cv', file)

  const response = await fetch(`/api/assessments/${assessmentId}/cv`, {
    method: 'POST',
    headers: authHeadersFormData(),
    body: formData
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to upload CV' }))
    throw new Error(errorData.error || 'Failed to upload CV')
  }

  return response.json() as Promise<{ textLength: number }>
}

/** Submit a draft for AI processing */
export async function submitForAi(assessmentId: string): Promise<any> {
  const response = await fetch(`/api/assessments/${assessmentId}/submit`, {
    method: 'POST',
    headers: authHeaders()
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit assessment' }))
    throw new Error(errorData.error || 'Failed to submit assessment')
  }

  return response.json()
}

/** Update an existing draft */
export async function updateDraft(assessmentId: string, updates: { specialtyId?: string | null; criteriaSetId?: string | null }): Promise<any> {
  const response = await fetch(`/api/assessments/${assessmentId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(updates)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to update draft' }))
    throw new Error(errorData.error || 'Failed to update draft')
  }

  return response.json()
}

/** Delete a draft assessment */
export async function deleteDraft(assessmentId: string): Promise<void> {
  const response = await fetch(`/api/assessments/${assessmentId}`, { method: 'DELETE', headers: authHeaders() })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to delete draft' }))
    throw new Error(errorData.error || 'Failed to delete draft')
  }
}

/** Submit admin review with overrides */
export async function submitReview(assessmentId: string, overrides: ReviewOverride[], rejectionReason?: string | null): Promise<any> {
  const response = await fetch(`/api/assessments/${assessmentId}/review`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ overrides, rejectionReason })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to submit review' }))
    throw new Error(errorData.error || 'Failed to submit review')
  }

  return response.json()
}

/** Approve an assessment with tier/rate */
export async function approveAssessment(assessmentId: string, options: {
  tierId?: string | null
  rateOverride?: number | null
  rationale?: string | null
}): Promise<any> {
  const response = await fetch(`/api/assessments/${assessmentId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(options)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to approve assessment' }))
    throw new Error(errorData.error || 'Failed to approve assessment')
  }

  return response.json()
}

/** Reject an assessment with reason */
export async function rejectAssessment(assessmentId: string, reason: string): Promise<any> {
  const response = await fetch(`/api/assessments/${assessmentId}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to reject assessment' }))
    throw new Error(errorData.error || 'Failed to reject assessment')
  }

  return response.json()
}

/** Fetch available tiers */
export async function fetchTiers(): Promise<Array<{ id: string; name: string; lowRate: number; highRate: number }>> {
  const response = await fetch('/api/tiers?active=true', { headers: authHeaders() })
  if (!response.ok) throw new Error('Failed to fetch tiers')
  return response.json()
}

/** Fetch available specialties */
export async function fetchSpecialties(): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch('/api/specialties?active=true', { headers: authHeaders() })
  if (!response.ok) throw new Error('Failed to fetch specialties')
  return response.json()
}

/** Fetch available criteria sets */
export async function fetchCriteriaSets(): Promise<Array<{ id: string; name: string }>> {
  const response = await fetch('/api/criteria-sets?active=true', { headers: authHeaders() })
  if (!response.ok) throw new Error('Failed to fetch criteria sets')
  return response.json()
}

/** Search HCPs by query */
export async function searchHcps(query: string, page = 1, limit = 20): Promise<any[]> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), search: query })
  const response = await fetch(`/api/hcps?${params}`, { headers: authHeaders() })
  if (!response.ok) throw new Error('Failed to search HCPs')
  const result = await response.json() as { data: any[] }
  return result.data
}

/** Create a new HCP (BU-create endpoint) */
export async function createHcp(data: {
  firstName: string; lastName: string; email?: string | null; phone?: string | null
  address?: string | null; state?: string | null; specialtyId?: string | null
  identifiers?: Array<{ type: string; value: string }>
}): Promise<any> {
  const response = await fetch('/api/hcps/bu-create', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to create HCP' }))
    throw new Error(errorData.error || 'Failed to create HCP')
  }

  return response.json()
}

/** Update HCP contact info */
export async function updateHcp(hcpId: string, data: { email?: string | null; phone?: string | null; address?: string | null; state?: string | null }): Promise<void> {
  const response = await fetch(`/api/hcps/${hcpId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    console.warn('HCP update failed (non-fatal):', response.statusText)
  }
}
