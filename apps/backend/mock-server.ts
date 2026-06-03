/**
 * Mock API Server — for demo/walkthrough only.
 * Replace with real backend when PostgreSQL + Redis are available.
 */
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json())

// ─── Mock Data ──────────────────────────────────────────────────────

const specialties = [
  { id: 'sp-1', name: 'Cardiology', description: 'Heart and cardiovascular system', isActive: true, tenantId: 'tenant-1' },
  { id: 'sp-2', name: 'Oncology', description: 'Cancer treatment and research', isActive: true, tenantId: 'tenant-1' },
  { id: 'sp-3', name: 'Neurology', description: 'Nervous system disorders', isActive: true, tenantId: 'tenant-1' },
  { id: 'sp-4', name: 'General Practice', description: 'Primary care medicine', isActive: true, tenantId: 'tenant-1' }
]

const tiers = [
  { id: 't-1', name: 'Tier 1 — Junior', minScore: 0, maxScore: 50, specialtyId: 'sp-4', lowRate: 80, highRate: 120, defaultPercentile: 50, tenantId: 'tenant-1' },
  { id: 't-2', name: 'Tier 2 — Mid', minScore: 51, maxScore: 75, specialtyId: 'sp-4', lowRate: 120, highRate: 180, defaultPercentile: 60, tenantId: 'tenant-1' },
  { id: 't-3', name: 'Tier 3 — Senior', minScore: 76, maxScore: 100, specialtyId: 'sp-4', lowRate: 180, highRate: 250, defaultPercentile: 70, tenantId: 'tenant-1' },
  { id: 't-4', name: 'Tier 1 — Junior', minScore: 0, maxScore: 50, specialtyId: 'sp-1', lowRate: 120, highRate: 180, defaultPercentile: 50, tenantId: 'tenant-1' },
  { id: 't-5', name: 'Tier 2 — Mid', minScore: 51, maxScore: 75, specialtyId: 'sp-1', lowRate: 180, highRate: 260, defaultPercentile: 60, tenantId: 'tenant-1' },
  { id: 't-6', name: 'Tier 3 — Senior', minScore: 76, maxScore: 100, specialtyId: 'sp-1', lowRate: 260, highRate: 350, defaultPercentile: 70, tenantId: 'tenant-1' }
]

const hcps = [
  { id: 'hcp-1', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@cardiocare.com', phone: '(555) 234-5678', address: '123 Medical Plaza', state: 'CA', specialtyId: 'sp-1', tenantId: 'tenant-1' },
  { id: 'hcp-2', firstName: 'Michael', lastName: 'Chen', email: 'mchen@oncohealth.org', phone: '(555) 345-6789', address: '456 Cancer Center Dr', state: 'NY', specialtyId: 'sp-2', tenantId: 'tenant-1' },
  { id: 'hcp-3', firstName: 'Emily', lastName: 'Rodriguez', email: 'emily.r@neuroclinic.com', phone: '(555) 456-7890', address: '789 Brain Institute Blvd', state: 'TX', specialtyId: 'sp-3', tenantId: 'tenant-1' },
  { id: 'hcp-4', firstName: 'James', lastName: 'Williams', email: 'jwilliams@familydoc.com', phone: '(555) 567-8901', address: '321 Main Street', state: 'FL', specialtyId: 'sp-4', tenantId: 'tenant-1' },
  { id: 'hcp-5', firstName: 'Lisa', lastName: 'Park', email: 'lpark@cardioexperts.com', phone: '(555) 678-9012', address: '654 Heart Ave', state: 'CA', specialtyId: 'sp-1', tenantId: 'tenant-1' },
  { id: 'hcp-6', firstName: 'David', lastName: 'Thompson', email: 'dthompson@genpractice.net', phone: '(555) 789-0123', address: '987 Community Rd', state: 'IL', specialtyId: 'sp-4', tenantId: 'tenant-1' },
  { id: 'hcp-7', firstName: 'Anna', lastName: 'Kim', email: 'akim@oncoresearch.org', phone: '(555) 890-1234', address: '147 Research Park', state: 'MA', specialtyId: 'sp-2', tenantId: 'tenant-1' },
  { id: 'hcp-8', firstName: 'Robert', lastName: 'Garcia', email: 'rgarcia@neurohealth.com', phone: '(555) 901-2345', address: '258 Neural Way', state: 'WA', specialtyId: 'sp-3', tenantId: 'tenant-1' }
]

const assessments = [
  { id: 'a-1', hcpId: 'hcp-1', submittedByUserId: 'user-bu-1', specialtyId: 'sp-1', criteriaSetId: 'cs-1', status: 'APPROVED', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-3', rationale: 'Meets all criteria', score: 25 }, { questionId: 'q-2', selectedAnswerId: 'a-7', rationale: 'Strong experience', score: 30 }], totalScore: 85, tierId: 't-6', rate: 310.50, approvedByUserId: 'user-admin-1', rejectionReason: null, tenantId: 'tenant-1', effectiveDate: '2025-01-15T00:00:00Z', renewalDate: new Date(Date.now() + 30 * 86400000).toISOString(), createdAt: '2025-01-10T10:00:00Z', updatedAt: '2025-01-20T14:00:00Z', submittedAt: '2025-01-18T09:00:00Z', completedAt: '2025-01-20T14:00:00Z' },
  { id: 'a-2', hcpId: 'hcp-2', submittedByUserId: 'user-bu-1', specialtyId: 'sp-2', criteriaSetId: 'cs-1', status: 'APPROVED', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-2', rationale: 'Good fit', score: 20 }, { questionId: 'q-2', selectedAnswerId: 'a-6', rationale: 'Solid background', score: 25 }], totalScore: 68, tierId: 't-2', rate: 145.00, approvedByUserId: 'user-admin-1', rejectionReason: null, tenantId: 'tenant-1', effectiveDate: '2025-03-01T00:00:00Z', renewalDate: new Date(Date.now() + 75 * 86400000).toISOString(), createdAt: '2025-02-25T10:00:00Z', updatedAt: '2025-03-05T11:00:00Z', submittedAt: '2025-03-02T09:00:00Z', completedAt: '2025-03-05T11:00:00Z' },
  { id: 'a-3', hcpId: 'hcp-4', submittedByUserId: 'user-bu-1', specialtyId: 'sp-4', criteriaSetId: 'cs-1', status: 'UNDER_REVIEW', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-1', rationale: 'Needs review', score: 15 }, { questionId: 'q-2', selectedAnswerId: 'a-4', rationale: 'Partial match', score: 20 }], totalScore: 42, tierId: null, rate: null, approvedByUserId: null, rejectionReason: null, tenantId: 'tenant-1', effectiveDate: null, renewalDate: null, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', submittedAt: '2025-05-30T09:00:00Z', completedAt: null },
  { id: 'a-4', hcpId: 'hcp-3', submittedByUserId: 'user-bu-1', specialtyId: 'sp-3', criteriaSetId: 'cs-1', status: 'AI_COMPLETE', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-5', rationale: 'AI analysis complete', score: 28 }, { questionId: 'q-2', selectedAnswerId: 'a-9', rationale: 'Strong credentials', score: 35 }], totalScore: 78, tierId: null, rate: null, approvedByUserId: null, rejectionReason: null, tenantId: 'tenant-1', effectiveDate: null, renewalDate: null, createdAt: '2025-05-28T10:00:00Z', updatedAt: '2025-06-01T08:00:00Z', submittedAt: '2025-05-27T09:00:00Z', completedAt: null },
  { id: 'a-5', hcpId: 'hcp-5', submittedByUserId: 'user-bu-1', specialtyId: 'sp-1', criteriaSetId: 'cs-1', status: 'REJECTED', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-1', rationale: 'Does not meet minimum', score: 5 }, { questionId: 'q-2', selectedAnswerId: 'a-3', rationale: 'Insufficient experience', score: 8 }], totalScore: 22, tierId: null, rate: null, approvedByUserId: null, rejectionReason: 'Does not meet minimum credential requirements for cardiology specialty.', tenantId: 'tenant-1', effectiveDate: null, renewalDate: null, createdAt: '2025-05-20T10:00:00Z', updatedAt: '2025-05-28T14:00:00Z', submittedAt: '2025-05-22T09:00:00Z', completedAt: '2025-05-28T14:00:00Z' },
  { id: 'a-6', hcpId: 'hcp-6', submittedByUserId: 'user-bu-1', specialtyId: 'sp-4', criteriaSetId: 'cs-1', status: 'APPROVED', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-3', rationale: 'Meets criteria', score: 22 }, { questionId: 'q-2', selectedAnswerId: 'a-6', rationale: 'Good standing', score: 28 }], totalScore: 70, tierId: 't-2', rate: 145.00, approvedByUserId: 'user-admin-1', rejectionReason: null, tenantId: 'tenant-1', effectiveDate: '2024-06-01T00:00:00Z', renewalDate: new Date(Date.now() - 7 * 86400000).toISOString(), createdAt: '2024-05-15T10:00:00Z', updatedAt: '2024-06-01T11:00:00Z', submittedAt: '2024-05-28T09:00:00Z', completedAt: '2024-06-01T11:00:00Z' },
  { id: 'a-7', hcpId: 'hcp-7', submittedByUserId: 'user-bu-1', specialtyId: 'sp-2', criteriaSetId: 'cs-1', status: 'DRAFT', aiResults: null, totalScore: null, tierId: null, rate: null, approvedByUserId: null, rejectionReason: null, tenantId: 'tenant-1', effectiveDate: null, renewalDate: null, createdAt: '2025-06-01T10:00:00Z', updatedAt: '2025-06-01T10:00:00Z', submittedAt: null, completedAt: null },
  { id: 'a-8', hcpId: 'hcp-8', submittedByUserId: 'user-bu-1', specialtyId: 'sp-3', criteriaSetId: 'cs-1', status: 'APPROVED', aiResults: [{ questionId: 'q-1', selectedAnswerId: 'a-4', rationale: 'Excellent fit', score: 30 }, { questionId: 'q-2', selectedAnswerId: 'a-8', rationale: 'Top credentials', score: 35 }], totalScore: 92, tierId: 't-6', rate: 310.50, approvedByUserId: 'user-admin-1', rejectionReason: null, tenantId: 'tenant-1', effectiveDate: '2025-04-01T00:00:00Z', renewalDate: new Date(Date.now() + 180 * 86400000).toISOString(), createdAt: '2025-03-15T10:00:00Z', updatedAt: '2025-04-01T11:00:00Z', submittedAt: '2025-03-28T09:00:00Z', completedAt: '2025-04-01T11:00:00Z' }
]

const notifications = [
  { id: 'n-1', userId: 'user-bu-1', type: 'ASSESSMENT_APPROVED', title: 'Assessment Approved — Sarah Johnson', message: 'Your assessment has been approved. Tier: Tier 3 — Senior, Rate: $310.50', readAt: null, createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'n-2', userId: 'user-bu-1', type: 'ASSESSMENT_REJECTED', title: 'Assessment Rejected — Lisa Park', message: 'Your assessment has been rejected. Does not meet minimum credential requirements.', readAt: null, createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'n-3', userId: 'user-bu-1', type: 'EXPIRY_REMINDER', title: 'Assessment Expiring Soon — David Thompson', message: 'URGENT: The assessment for David Thompson (Tier: Tier 2 — Mid) expires on June 8, 2025. Please submit a renewal assessment.', readAt: null, createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
  { id: 'n-4', userId: 'user-bu-1', type: 'ASSESSMENT_APPROVED', title: 'Assessment Approved — Michael Chen', message: 'Your assessment has been approved. Tier: Tier 2 — Mid, Rate: $145.00', readAt: new Date(Date.now() - 3 * 86400000).toISOString(), createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'n-5', userId: 'user-bu-1', type: 'EXPIRY_REMINDER', title: 'Assessment Expiring Soon — Sarah Johnson', message: 'HIGH: The assessment for Sarah Johnson (Tier: Tier 3 — Senior) expires on July 1, 2025.', readAt: null, createdAt: new Date(Date.now() - 6 * 86400000).toISOString() }
]

const users = [
  { id: 'user-bu-1', email: 'bu@company.com', role: 'BU' as const, tenantId: 'tenant-1', isActive: true, emailVerified: true },
  { id: 'user-admin-1', email: 'admin@company.com', role: 'ADMIN' as const, tenantId: 'tenant-1', isActive: true, emailVerified: true },
  { id: 'user-sa-1', email: 'sa@company.com', role: 'SA' as const, tenantId: 'tenant-1', isActive: true, emailVerified: true }
]

// ─── Helpers ────────────────────────────────────────────────────────

function getHcp(id: string) { return hcps.find(h => h.id === id) }
function getTier(id: string) { return tiers.find(t => t.id === id) }
function getSpecialty(id: string) { return specialties.find(s => s.id === id) }

function enrichAssessment(a: typeof assessments[0]) {
  const hcp = getHcp(a.hcpId)
  const tier = getTier(a.tierId || '')
  const specialty = a.specialtyId ? getSpecialty(a.specialtyId) : null
  return { ...a, hcp, tier, specialty }
}

// ─── Auth Endpoints (mock) ──────────────────────────────────────────

app.post('/api/auth/login', (_req, res) => {
  // Accept any BU login for demo
  const email = 'bu@company.com'
  const user = users.find(u => u.email === email)!
  res.json({
    accessToken: 'mock-jwt-token-bu',
    refreshToken: 'mock-refresh-token',
    user: { ...user, passwordHash: undefined }
  })
})

app.post('/api/auth/refresh', (_req, res) => {
  res.json({ accessToken: 'mock-jwt-token-bu-2', refreshToken: 'mock-refresh-token' })
})

app.get('/api/auth/me', (req, res) => {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer mock')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Default to BU user for demo
  const user = users.find(u => u.email === 'bu@company.com')!
  res.json({ ...user, passwordHash: undefined })
})

app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Logged out' })
})

// ─── Assessments ────────────────────────────────────────────────────

app.get('/api/assessments', (req, res) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
  const search = (req.query.search as string) || ''
  const statusFilter = req.query.status as string

  let filtered = [...assessments]

  // BU sees own only (in mock, all are from user-bu-1)
  if (!statusFilter && !search) {
    // Return all for demo
  } else {
    if (statusFilter) {
      filtered = filtered.filter(a => a.status === statusFilter)
    }
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(a => {
        const hcp = getHcp(a.hcpId)
        return hcp && (hcp.firstName.toLowerCase().includes(s) || hcp.lastName.toLowerCase().includes(s))
      })
    }
  }

  const totalCount = filtered.length
  const paged = filtered.slice((page - 1) * limit, page * limit).map(enrichAssessment)

  res.json({
    data: paged,
    pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
  })
})

app.get('/api/assessments/:id', (req, res) => {
  const a = assessments.find(x => x.id === req.params.id)
  if (!a) return res.status(404).json({ error: 'Not found' })
  res.json(enrichAssessment(a))
})

// ─── HCPs ───────────────────────────────────────────────────────────

app.get('/api/hcps', (req, res) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))
  const search = (req.query.search as string) || ''

  let filtered = [...hcps]
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(h =>
      h.firstName.toLowerCase().includes(s) ||
      h.lastName.toLowerCase().includes(s) ||
      h.state?.toLowerCase().includes(s)
    )
  }

  const totalCount = filtered.length
  res.json({
    data: filtered.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
  })
})

// ─── Specialties ────────────────────────────────────────────────────

app.get('/api/specialties', (_req, res) => {
  const activeOnly = req.query.active === 'true'
  if (activeOnly) {
    return res.json(specialties.filter(s => s.isActive))
  }
  res.json(specialties)
})

// ─── Tiers ──────────────────────────────────────────────────────────

app.get('/api/tiers', (_req, res) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25))

  const totalCount = tiers.length
  res.json({
    data: tiers.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) }
  })
})

// ─── Notifications ──────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const unreadOnly = req.query.unreadOnly === 'true'
  let filtered = notifications.filter(n => n.userId === 'user-bu-1')
  if (unreadOnly) filtered = filtered.filter(n => !n.readAt)

  const unreadCount = notifications.filter(n => n.userId === 'user-bu-1' && !n.readAt).length

  res.json({
    data: filtered,
    pagination: { page: 1, limit: 25, totalCount: filtered.length, totalPages: 1 },
    unreadCount
  })
})

app.get('/api/notifications/unread-count', (_req, res) => {
  const count = notifications.filter(n => n.userId === 'user-bu-1' && !n.readAt).length
  res.json({ unreadCount: count })
})

app.put('/api/notifications/:id/read', (req, res) => {
  const n = notifications.find(x => x.id === req.params.id)
  if (!n) return res.status(404).json({ error: 'Not found' })
  n.readAt = new Date().toISOString()
  res.json(n)
})

app.put('/api/notifications/mark-all-read', (_req, res) => {
  notifications.filter(n => n.userId === 'user-bu-1').forEach(n => { n.readAt = new Date().toISOString() })
  res.json({ message: 'All marked as read' })
})

// ─── User Settings ──────────────────────────────────────────────────

app.get('/api/userSettings/me/settings', (_req, res) => {
  res.json({ inApp: true, email: true })
})

app.put('/api/userSettings/me/settings', (req, res) => {
  res.json(req.body)
})

// ─── Application Settings ───────────────────────────────────────────

app.get('/api/application-settings', (_req, res) => {
  res.json([
    { id: 'as-1', key: 'approvalValidityPeriod', value: 730, description: 'Default validity period for approved assessments in days', tenantId: 'tenant-1' },
    { id: 'as-2', key: 'expiryReminderLeadTime', value: 30, description: 'Days before renewal to send expiry reminders', tenantId: 'tenant-1' }
  ])
})

app.get('/api/application-settings/:key', (req, res) => {
  const s = [{ id: 'as-1', key: 'approvalValidityPeriod', value: 730, description: '', tenantId: 'tenant-1' },
             { id: 'as-2', key: 'expiryReminderLeadTime', value: 30, description: '', tenantId: 'tenant-1' }].find(x => x.key === req.params.key)
  if (!s) return res.status(404).json({ error: 'Not found' })
  res.json(s)
})

app.put('/api/application-settings/:key', (req, res) => {
  const s = [{ id: 'as-1', key: 'approvalValidityPeriod', value: 730, tenantId: 'tenant-1' },
             { id: 'as-2', key: 'expiryReminderLeadTime', value: 30, tenantId: 'tenant-1' }].find(x => x.key === req.params.key)
  if (!s) return res.status(404).json({ error: 'Not found' })
  s.value = req.body.value
  res.json(s)
})

// ─── Health ─────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok (mock)', timestamp: new Date().toISOString() })
})

// ─── Start ──────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🎭 Mock API server running on http://localhost:${PORT}`)
  console.log('   (Replace with real backend when PostgreSQL + Redis are available)')
})
