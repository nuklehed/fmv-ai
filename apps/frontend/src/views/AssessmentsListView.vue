<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

interface AssessmentListItem {
  id: string
  hcp: { firstName: string; lastName: string; email?: string }
  submittedByUser: { id: string; email: string }
  specialtyId?: string
  criteriaSetId?: string
  status: string
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

interface AiResultItem {
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

const router = useRouter()

const assessments = ref<AssessmentListItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref<string>('')
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = ref(0)
const totalCount = ref(0)
const formError = ref('')

// Detail panel state
const selectedAssessment = ref<AssessmentListItem | null>(null)
const showDetailPanel = ref(false)

// Review workflow state (Admin/SA only)
const isReviewing = ref(false)
const reviewOverrides = ref<Array<{ questionId: string; selectedAnswerId: string; rationale: string }>>([])
const rejectionReason = ref('')
const approveTierId = ref('')
const approveRateOverride = ref('')
const approveRationale = ref('')
const isApproving = ref(false)
const isRejecting = ref(false)
const reviewError = ref('')

// Available tiers for approval (loaded from API)
const availableTiers = ref<Array<{ id: string; name: string; lowRate: number; highRate: number }>>([])

// Helper to get question text by ID
function getQuestionText(_questionId: string | undefined): string {
  if (!selectedAssessment.value?.aiResults) return 'Unknown Question'
  // This would ideally come from the criteria set data
  return 'See AI results below'
}

// Cast aiResults to AiResultItem[] for template use
function getAiResults(): AiResultItem[] {
  if (!selectedAssessment.value?.aiResults) return []
  return selectedAssessment.value.aiResults as unknown as AiResultItem[]
}

// Helper to get answers for a question (would need criteria set data)
function getAnswersForQuestion(_questionId: string | undefined): Array<{ id: string; text: string; score: number }> {
  // This would be populated from the criteria set data when loading assessment details
  return []
}

// Add new override entry
function addOverride() {
  reviewOverrides.value.push({
    questionId: '',
    selectedAnswerId: '',
    rationale: ''
  })
}

// Remove override entry
function removeOverride(index: number) {
  reviewOverrides.value.splice(index, 1)
}

async function fetchAssessments() {
  loading.value = true
  try {
    const token = localStorage.getItem('accessToken')
    const params = new URLSearchParams({
      page: String(currentPage.value),
      limit: String(pageSize.value),
      search: searchQuery.value || '',
      ...(statusFilter.value ? { status: statusFilter.value } : {})
    })

    const response = await fetch(`/api/assessments?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to fetch assessments: ${response.statusText}`)

    const result = await response.json()
    assessments.value = result.data
    totalPages.value = result.pagination.totalPages
    totalCount.value = result.pagination.totalCount
  } catch (error) {
    console.error('Error fetching assessments:', error)
    formError.value = 'Failed to load assessments'
  } finally {
    loading.value = false
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    AI_PROCESSING: 'bg-yellow-100 text-yellow-800',
    AI_COMPLETE: 'bg-purple-100 text-purple-800',
    UNDER_REVIEW: 'bg-orange-100 text-orange-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800'
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    AI_PROCESSING: 'AI Processing',
    AI_COMPLETE: 'AI Complete',
    UNDER_REVIEW: 'Under Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
  }
  return labels[status] || status
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

async function openDetailPanel(assessment: AssessmentListItem) {
  selectedAssessment.value = assessment
  showDetailPanel.value = true
  isReviewing.value = false
  reviewOverrides.value = []
  rejectionReason.value = ''
  approveTierId.value = ''
  approveRateOverride.value = ''
  approveRationale.value = ''
  reviewError.value = ''

  // Load tiers if assessment can be approved
  if (canApprove(assessment)) {
    await loadTiers()
  }
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedAssessment.value = null
  isReviewing.value = false
  reviewOverrides.value = []
  rejectionReason.value = ''
  approveTierId.value = ''
  approveRateOverride.value = ''
  approveRationale.value = ''
  reviewError.value = ''
}

function handleSearch() {
  currentPage.value = 1
  fetchAssessments()
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => handleSearch(), 300)
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    fetchAssessments()
  }
}

// Auto-refresh assessments that are in AI_PROCESSING status every 30 seconds
function startAutoRefresh() {
  void setInterval(() => {
    const hasProcessing = assessments.value.some(a => a.status === 'AI_PROCESSING')
    if (hasProcessing) {
      fetchAssessments()
    }
  }, 30000) // Every 30 seconds
}

// ─── Review Workflow Functions ──────────────────────────────────────

// ─── Draft Assessment Actions ──────────────────────────────────────

function isDraft(assessment: AssessmentListItem): boolean {
  return assessment.status === 'DRAFT'
}

function navigateToEditDraft(id: string): void {
  router.push(`/assessments/edit/${id}`)
}

async function deleteDraft(assessment: AssessmentListItem) {
  if (!confirm(`Are you sure you want to delete the draft assessment for ${assessment.hcp.firstName} ${assessment.hcp.lastName}?`)) {
    return
  }

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/assessments/${assessment.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to delete draft')
    }

    // Refresh the list
    await fetchAssessments()
  } catch (error) {
    console.error('Error deleting draft:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to delete draft'
    setTimeout(() => { formError.value = '' }, 5000)
  }
}

function isAdminOrSA(): boolean {
  const role = localStorage.getItem('userRole')
  return role === 'ADMIN' || role === 'SA'
}

function canReview(assessment: AssessmentListItem): boolean {
  return assessment.status === 'AI_COMPLETE' && isAdminOrSA()
}

function canApprove(assessment: AssessmentListItem): boolean {
  return assessment.status === 'UNDER_REVIEW' && isAdminOrSA()
}

function canReject(assessment: AssessmentListItem): boolean {
  return assessment.status === 'UNDER_REVIEW' && isAdminOrSA()
}

function startReview() {
  isReviewing.value = true
  reviewError.value = ''
  // Initialize overrides with current AI results
  if (selectedAssessment.value?.aiResults) {
    const aiResults = (selectedAssessment.value!.aiResults ?? []) as unknown as AiResultItem[]
    reviewOverrides.value = aiResults.map(r => ({
      questionId: r.questionId,
      selectedAnswerId: r.selectedAnswerId,
      rationale: r.rationale || ''
    }))
  }
}

function cancelReview() {
  isReviewing.value = false
  reviewOverrides.value = []
  rejectionReason.value = ''
  reviewError.value = ''
}

async function submitReview() {
  if (!selectedAssessment.value) return

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/assessments/${selectedAssessment.value.id}/review`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        overrides: reviewOverrides.value,
        rejectionReason: rejectionReason.value || null
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to submit review')
    }

    // Refresh the assessment list
    await fetchAssessments()
    closeDetailPanel()
  } catch (error) {
    console.error('Error submitting review:', error)
    reviewError.value = error instanceof Error ? error.message : 'Failed to submit review'
  }
}

async function loadTiers() {
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/tiers?active=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) {
      availableTiers.value = await response.json()
    }
  } catch (error) {
    console.error('Error fetching tiers:', error)
  }
}

async function approveAssessment() {
  if (!selectedAssessment.value) return

  isApproving.value = true
  reviewError.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/assessments/${selectedAssessment.value.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        tierId: approveTierId.value || null,
        rateOverride: approveRateOverride.value ? parseFloat(approveRateOverride.value) : null,
        rationale: approveRationale.value || null
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to approve assessment')
    }

    // Refresh the assessment list
    await fetchAssessments()
    closeDetailPanel()
  } catch (error) {
    console.error('Error approving assessment:', error)
    reviewError.value = error instanceof Error ? error.message : 'Failed to approve assessment'
  } finally {
    isApproving.value = false
  }
}

async function rejectAssessment() {
  if (!selectedAssessment.value) return

  if (!rejectionReason.value.trim()) {
    reviewError.value = 'Rejection reason is required'
    return
  }

  isRejecting.value = true
  reviewError.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/assessments/${selectedAssessment.value.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        reason: rejectionReason.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to reject assessment')
    }

    // Refresh the assessment list
    await fetchAssessments()
    closeDetailPanel()
  } catch (error) {
    console.error('Error rejecting assessment:', error)
    reviewError.value = error instanceof Error ? error.message : 'Failed to reject assessment'
  } finally {
    isRejecting.value = false
  }
}

onMounted(() => {
  fetchAssessments()
  startAutoRefresh()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Assessments</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} assessments ({{ statusFilter ? 'filtered' :
            'all' }})</p>
        </div>
        <a href="/assessments/new"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium">
          + Request Assessment
        </a>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showDetailPanel" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex items-center space-x-4">
        <input v-model="searchQuery" @input="onSearchInput" type="text" placeholder="Search by HCP name..."
          class="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        <select v-model="statusFilter" @change="handleSearch"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="AI_PROCESSING">AI Processing</option>
          <option value="AI_COMPLETE">AI Complete</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading assessments...</p>
      </div>

      <!-- Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HCP</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="assessments.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
                No assessments found. Click "Request Assessment" to create one.
              </td>
            </tr>
            <tr v-for="assessment in assessments" :key="assessment.id" class="hover:bg-gray-50 cursor-pointer"
              @click="openDetailPanel(assessment)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ assessment.hcp.firstName }} {{ assessment.hcp.lastName
                  }}</div>
                <div v-if="assessment.hcp.email" class="text-xs text-gray-500">{{ assessment.hcp.email }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(assessment.status)]">
                  <!-- Processing spinner -->
                  <svg v-if="assessment.status === 'AI_PROCESSING'" class="animate-spin -ml-1 mr-2 h-3 w-3"
                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                    </path>
                  </svg>
                  {{ getStatusLabel(assessment.status) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ assessment.totalScore !== null ? assessment.totalScore : '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(assessment.submittedAt) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(assessment.completedAt) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <!-- DRAFT status actions -->
                <template v-if="isDraft(assessment)">
                  <button
                    @click="navigateToEditDraft(assessment.id)"
                    class="text-blue-600 hover:text-blue-900 font-medium mr-3"
                  >
                    {{ isAdminOrSA() ? 'Edit' : 'Continue' }}
                  </button>
                  <button
                    @click.stop="deleteDraft(assessment)"
                    class="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </template>
                <!-- Non-DRAFT status actions -->
                <template v-else>
                  <button @click="openDetailPanel(assessment)" class="text-blue-600 hover:text-blue-900">View</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1"
          class="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div class="text-sm text-gray-500">
            Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ Math.min(currentPage * pageSize, totalCount) }} of {{
              totalCount }} results
          </div>
          <div class="flex space-x-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1"
              class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Previous</button>
            <template v-for="p in Math.min(5, totalPages)" :key="p">
              <button @click="goToPage(p)" :class="[
                'px-3 py-1 border rounded text-sm',
                p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
              ]">{{ p }}</button>
            </template>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages"
              class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
          </div>
        </div>
      </div>

      <!-- ─── Detail Slide-over Panel ────────────────────────────── -->
      <Teleport to="body">
        <Transition name="slideover">
          <div v-if="showDetailPanel && selectedAssessment" class="fixed inset-0 z-50 overflow-hidden">
            <div class="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="closeDetailPanel" />

            <div class="fixed inset-y-0 right-0 max-w-lg w-full flex">
              <Transition name="slideover-panel">
                <div v-if="showDetailPanel && selectedAssessment"
                  class="w-full h-full flex flex-col bg-white shadow-xl">
                  <!-- Panel Header -->
                  <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h3 class="text-lg font-semibold text-gray-900">Assessment Details</h3>
                    <button @click="closeDetailPanel" class="text-gray-400 hover:text-gray-600">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <!-- Panel Content -->
                  <div class="flex-1 overflow-y-auto p-6 space-y-4">
                    <!-- HCP Info -->
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">HCP</h4>
                      <p class="text-base font-semibold text-gray-900">{{ selectedAssessment.hcp.firstName }} {{
                        selectedAssessment.hcp.lastName }}</p>
                      <p v-if="selectedAssessment.hcp.email" class="text-sm text-gray-600">{{
                        selectedAssessment.hcp.email }}
                      </p>
                    </div>

                    <!-- Status -->
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Status</h4>
                      <span
                        :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(selectedAssessment.status)]">
                        {{ getStatusLabel(selectedAssessment.status) }}
                      </span>
                    </div>

                    <!-- Score -->
                    <div v-if="selectedAssessment.totalScore !== null">
                      <h4 class="text-sm font-medium text-gray-500 mb-1">Total Score</h4>
                      <p class="text-2xl font-bold text-gray-900">{{ selectedAssessment.totalScore }}</p>
                    </div>

                    <!-- AI Results -->
                    <div
                      v-if="selectedAssessment.aiResults && Array.isArray(selectedAssessment.aiResults) && selectedAssessment.aiResults.length > 0">
                      <h4 class="text-sm font-medium text-gray-500 mb-2">AI Evaluation Results</h4>

                      <!-- Review Mode -->
                      <div v-if="isReviewing" class="space-y-3">
                        <div v-for="(override, index) in reviewOverrides" :key="index"
                          class="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div class="flex items-start justify-between mb-2">
                            <span class="text-xs font-medium text-blue-700">Question {{ index + 1 }}</span>
                            <button @click="removeOverride(index)"
                              class="text-xs text-red-600 hover:text-red-800">Remove</button>
                          </div>

                          <!-- Question Text -->
                          <p class="text-sm font-medium text-gray-900 mb-2">
                            {{ getQuestionText(selectedAssessment.aiResults[index]?.questionId) }}
                          </p>

                          <!-- Answer Selection -->
                          <div class="mb-2">
                            <label class="block text-xs font-medium text-gray-700 mb-1">Select Answer</label>
                            <select v-model="override.selectedAnswerId"
                              class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                              <option value="">Select answer...</option>
                              <!-- Options would be populated from criteria set data -->
                              <option
                                v-for="answer in getAnswersForQuestion(selectedAssessment.aiResults[index]?.questionId)"
                                :key="answer.id" :value="answer.id">
                                {{ answer.text }} ({{ answer.score }} pts)
                              </option>
                            </select>
                          </div>

                          <!-- Rationale -->
                          <div>
                            <label class="block text-xs font-medium text-gray-700 mb-1">Rationale</label>
                            <textarea v-model="override.rationale" rows="2" placeholder="Explain your selection..."
                              class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
                          </div>
                        </div>
                      </div>

                      <!-- Add Override Button -->
                      <button @click="addOverride" class="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">
                        + Add Override
                      </button>
                    </div>

                    <!-- View Mode (AI Results Display) -->
                    <div v-else class="space-y-3">
                      <div v-for="(result, index) in getAiResults()" :key="index"
                        class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div class="flex items-start justify-between mb-1">
                          <span class="text-xs font-medium text-gray-600">Question {{ index + 1 }}</span>
                          <span v-if="result.isOverride"
                            class="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">Admin Override</span>
                        </div>
                        <p class="text-sm font-medium text-gray-900">{{ result.questionText || `Question ${index +
                          1}` }}</p>
                        <p class="text-xs text-blue-600 mt-1">Selected: {{ result.selectedAnswerText || '—' }} ({{
                          result.score ?? '?' }} pts)</p>
                        <p v-if="result.rationale" class="text-xs text-gray-600 mt-1 italic">{{ result.rationale }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <!-- Tier & Rate Information -->
                  <div v-if="selectedAssessment.tier || selectedAssessment.rate"
                    class="p-3 bg-green-50 rounded-lg border border-green-200">
                    <h4 class="text-sm font-medium text-green-900 mb-2">Tier & Rate</h4>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span class="text-gray-600">Tier:</span>
                        <span class="ml-1 font-medium">{{ selectedAssessment.tier?.name || '—' }}</span>
                      </div>
                      <div>
                        <span class="text-gray-600">Rate:</span>
                        <span class="ml-1 font-medium">${{ selectedAssessment.rate?.toFixed(2) || '—' }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Effective & Renewal Dates -->
                  <div v-if="selectedAssessment.effectiveDate || selectedAssessment.renewalDate"
                    class="grid grid-cols-2 gap-4">
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Effective Date</h4>
                      <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.effectiveDate) }}</p>
                    </div>
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Renewal Date</h4>
                      <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.renewalDate) }}</p>
                    </div>
                  </div>

                  <!-- Dates -->
                  <div class="grid grid-cols-2 gap-4 p-6">
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Created</h4>
                      <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.createdAt) }}</p>
                    </div>
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Submitted</h4>
                      <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.submittedAt) }}</p>
                    </div>
                  </div>

                  <!-- Rejection Reason -->
                  <div v-if="selectedAssessment.rejectionReason">
                    <h4 class="text-sm font-medium text-red-600 mb-2">Rejection Reason</h4>
                    <p class="text-sm text-gray-900 bg-red-50 p-3 rounded-lg">{{ selectedAssessment.rejectionReason }}
                    </p>
                  </div>

                  <!-- Submitted By -->
                  <div class="p-6">
                    <h4 class="text-sm font-medium text-gray-500 mb-2">Submitted By</h4>
                    <p class="text-sm text-gray-900">{{ selectedAssessment.submittedByUser.email }}</p>
                  </div>

                  <!-- Start Review Button (shown when review is possible but not yet started) -->
                  <div v-if="canReview(selectedAssessment) && !isReviewing" class="border-t border-gray-200 pt-4">
                    <button @click="startReview"
                      class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors">
                      Start Review
                    </button>
                  </div>

                  <!-- Review Workflow UI -->
                  <div v-if="canReview(selectedAssessment) && isReviewing" class="border-t border-gray-200 pt-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-3">Admin Review</h4>

                    <!-- Error Message -->
                    <div v-if="reviewError" class="mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p class="text-sm text-red-600">{{ reviewError }}</p>
                    </div>

                    <!-- Reject Section -->
                    <div class="mb-4">
                      <label for="rejection-reason" class="block text-xs font-medium text-gray-700 mb-1">Rejection
                        Reason
                        (optional)</label>
                      <textarea id="rejection-reason" v-model="rejectionReason" rows="2"
                        placeholder="Provide reason for rejection..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"></textarea>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex space-x-3">
                      <button @click="submitReview" :disabled="isRejecting || isApproving"
                        class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                        {{ isRejecting ? 'Processing...' : 'Save Review' }}
                      </button>
                      <button @click="rejectAssessment"
                        :disabled="!rejectionReason.trim() || isRejecting || isApproving"
                        class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                        {{ isRejecting ? 'Processing...' : 'Reject' }}
                      </button>
                      <button @click="cancelReview"
                        class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>

                  <!-- Approve Section (UNDER_REVIEW status) -->
                  <div v-if="canApprove(selectedAssessment)" class="border-t border-gray-200 pt-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-3">Approve Assessment</h4>

                    <!-- Error Message -->
                    <div v-if="reviewError" class="mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p class="text-sm text-red-600">{{ reviewError }}</p>
                    </div>

                    <!-- Tier Selection -->
                    <div class="mb-3">
                      <label for="approve-tier" class="block text-xs font-medium text-gray-700 mb-1">Tier</label>
                      <select id="approve-tier" v-model="approveTierId"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Auto-assign based on score</option>
                        <!-- Tiers would be loaded from API -->
                        <option v-for="tier in availableTiers" :key="tier.id" :value="tier.id">
                          {{ tier.name }} ({{ tier.lowRate }} - {{ tier.highRate }})
                        </option>
                      </select>
                    </div>

                    <!-- Rate Override -->
                    <div class="mb-3">
                      <label for="rate-override" class="block text-xs font-medium text-gray-700 mb-1">Rate Override
                        (optional)</label>
                      <input id="rate-override" v-model="approveRateOverride" type="number" step="0.01"
                        placeholder="Override calculated rate"
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <!-- Rationale -->
                    <div class="mb-3">
                      <label for="approve-rationale" class="block text-xs font-medium text-gray-700 mb-1">Rationale
                        (optional)</label>
                      <textarea id="approve-rationale" v-model="approveRationale" rows="2"
                        placeholder="Explain approval decision..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
                    </div>

                    <!-- Approve Button -->
                    <button @click="approveAssessment" :disabled="isApproving || isRejecting"
                      class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                      {{ isApproving ? 'Processing...' : 'Approve Assessment' }}
                    </button>
                  </div>

                  <!-- Reject Section (UNDER_REVIEW status) -->
                  <div v-if="canReject(selectedAssessment)" class="border-t border-gray-200 pt-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-3">Reject Assessment</h4>

                    <!-- Error Message -->
                    <div v-if="reviewError" class="mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p class="text-sm text-red-600">{{ reviewError }}</p>
                    </div>

                    <!-- Rejection Reason -->
                    <div class="mb-3">
                      <label for="reject-reason" class="block text-xs font-medium text-gray-700 mb-1">Rejection Reason
                        *</label>
                      <textarea id="reject-reason" v-model="rejectionReason" rows="3"
                        placeholder="Provide detailed reason for rejection..." required
                        class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"></textarea>
                    </div>

                    <!-- Reject Button -->
                    <button @click="rejectAssessment" :disabled="isRejecting || isApproving"
                      class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                      {{ isRejecting ? 'Processing...' : 'Reject Assessment' }}
                    </button>
                  </div>

                  <!-- Panel Footer -->
                  <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <a href="/assessments/new"
                      class="block w-full text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Request
                      New Assessment</a>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </Teleport>
    </main>
  </div>
</template>

<style scoped>
.slideover-enter-active,
.slideover-leave-active {
  transition: opacity 0.3s ease;
}

.slideover-enter-from,
.slideover-leave-to {
  opacity: 0;
}

.slideover-panel-enter-active,
.slideover-panel-leave-active {
  transition: transform 0.3s ease;
}

.slideover-panel-enter-from,
.slideover-panel-leave-to {
  transform: translateX(100%);
}
</style>