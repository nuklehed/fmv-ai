<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as assessmentDomain from '@/domain/assessment'

const router = useRouter()

// ─── List State ──────────────────────────────────────────────────

const assessments = ref<assessmentDomain.AssessmentListItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const statusFilter = ref<string>('')
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = ref(0)
const totalCount = ref(0)
const formError = ref('')

// ─── Detail Panel State ──────────────────────────────────────────

interface FullAssessment extends assessmentDomain.AssessmentListItem {
  criteriaSet?: { questions: Array<{ id: string; text: string; answers: Array<{ id: string; text: string; score: number }> }> }
}

const selectedAssessment = ref<FullAssessment | null>(null)
const detailLoading = ref(false)
const showDetailPanel = ref(false)

// ─── Review Workflow State (Admin/SA only) — used for inline approve/reject in detail panel ──

const isReviewing = ref(false)
const reviewOverrides = ref<Array<{ questionId: string; selectedAnswerId: string; rationale: string }>>([])
const rejectionReason = ref('')
const approveTierId = ref('')
const approveRateOverride = ref('')
const approveRationale = ref('')
const isApproving = ref(false)
const isRejecting = ref(false)
const reviewError = ref('')

// ─── Available Tiers for Approval ────────────────────────────────

const availableTiers = ref<Array<{ id: string; name: string; lowRate: number; highRate: number }>>([])

// ─── List Operations ─────────────────────────────────────────────

async function fetchAssessments() {
  loading.value = true
  try {
    const result = await assessmentDomain.fetchAssessments({
      page: currentPage.value, limit: pageSize.value,
      search: searchQuery.value || undefined, statusFilter: statusFilter.value || undefined
    })
    assessments.value = result.data
    totalPages.value = result.pagination.totalPages
    totalCount.value = result.pagination.totalCount
  } catch {
    formError.value = 'Failed to load assessments'
  } finally {
    loading.value = false
  }
}

function handleSearch() { currentPage.value = 1; fetchAssessments() }

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => handleSearch(), 300)
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) { currentPage.value = page; fetchAssessments() }
}

// Auto-refresh assessments in AI_PROCESSING status every 30 seconds
function startAutoRefresh() {
  void setInterval(() => {
    const hasProcessing = assessments.value.some(a => a.status === 'AI_PROCESSING')
    if (hasProcessing) fetchAssessments()
  }, 30000)
}

// ─── Detail Panel ────────────────────────────────────────────────

async function openDetailPanel(assessment: assessmentDomain.AssessmentListItem) {
  detailLoading.value = true
  showDetailPanel.value = true
  isReviewing.value = false; reviewOverrides.value = []
  rejectionReason.value = ''; approveTierId.value = ''
  approveRateOverride.value = ''; approveRationale.value = ''
  reviewError.value = ''

  try {
    const full = await assessmentDomain.fetchAssessment(assessment.id)
    selectedAssessment.value = full as unknown as FullAssessment
  } catch { /* keep the list item as fallback */ }

  if (assessmentDomain.canApprove(selectedAssessment.value || assessment)) await loadTiers()
  detailLoading.value = false
}

function closeDetailPanel() {
  showDetailPanel.value = false; selectedAssessment.value = null
  isReviewing.value = false; reviewOverrides.value = []
  rejectionReason.value = ''; approveTierId.value = ''
  approveRateOverride.value = ''; approveRationale.value = ''
  reviewError.value = ''
}

// ─── Draft Actions ───────────────────────────────────────────────

function navigateToEditDraft(id: string): void { router.push(`/assessments/edit/${id}`) }

function navigateToReview(assessment: assessmentDomain.AssessmentListItem): void {
  router.push(`/assessments/${assessment.id}/review`)
}

async function deleteDraft(assessment: assessmentDomain.AssessmentListItem) {
  if (!confirm(`Are you sure you want to delete the draft assessment for ${assessment.hcp.firstName} ${assessment.hcp.lastName}?`)) return

  try {
    await assessmentDomain.deleteDraft(assessment.id)
    await fetchAssessments()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to delete draft'
    setTimeout(() => { formError.value = '' }, 5000)
  }
}

// ─── Review Workflow (inline approve/reject for UNDER_REVIEW status) ─────────────────────────────
// Note: Inline review mode removed — use dedicated /assessments/:id/review page instead

async function loadTiers() {
  try {
    const criteriaSetId = selectedAssessment.value?.criteriaSetId
    if (criteriaSetId) {
      const data = await assessmentDomain.fetchTierThresholds(criteriaSetId)
      availableTiers.value = data.thresholds.map((t: any) => ({
        id: t.label,
        name: t.label,
        lowRate: 0,
        highRate: 0
      }))
    }
  } catch { /* silent */ }
}

async function approveAssessment() {
  if (!selectedAssessment.value) return
  isApproving.value = true; reviewError.value = ''
  try {
    await assessmentDomain.approveAssessment(selectedAssessment.value.id, {
      tierLabel: approveTierId.value || null,
      rateOverride: approveRateOverride.value ? parseFloat(approveRateOverride.value) : null,
      rationale: approveRationale.value || null
    })
    await fetchAssessments(); closeDetailPanel()
  } catch (error) { reviewError.value = error instanceof Error ? error.message : 'Failed to approve assessment' }
  finally { isApproving.value = false }
}

async function rejectAssessment() {
  if (!selectedAssessment.value) return
  if (!rejectionReason.value.trim()) { reviewError.value = 'Rejection reason is required'; return }
  isRejecting.value = true; reviewError.value = ''
  try {
    await assessmentDomain.rejectAssessment(selectedAssessment.value.id, rejectionReason.value)
    await fetchAssessments(); closeDetailPanel()
  } catch (error) { reviewError.value = error instanceof Error ? error.message : 'Failed to reject assessment' }
  finally { isRejecting.value = false }
}

// ─── Retry Failed Assessment ─────────────────────────────────────

const retryLoading = ref(false)
const retrySuccess = ref('')
const cancelLoading = ref(false)
const showDiagnosticInfo = ref(false)
const showRawResponse = ref(false)
const showRawPrompt = ref(false)

async function retryFailedAssessment(assessment: assessmentDomain.AssessmentListItem) {
  if (!confirm(`Retry AI processing for ${assessment.hcp.firstName} ${assessment.hcp.lastName}?`)) return
  retryLoading.value = true; retrySuccess.value = ''
  try {
    // Pre-flight LLM health check to give better error feedback
    const health = await assessmentDomain.checkLlmHealth()
    if (!health.ok) {
      formError.value = `LLM server unreachable: ${health.error || 'Connection failed'}. Please check your Ollama/Tailscale connection and try again.`
      setTimeout(() => { formError.value = '' }, 8000)
      retryLoading.value = false
      return
    }
    await assessmentDomain.retryAssessment(assessment.id)
    retrySuccess.value = 'Retrying... Status will update to AI_PROCESSING'
    await fetchAssessments()
    setTimeout(() => { retrySuccess.value = '' }, 5000)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to retry assessment'
    setTimeout(() => { formError.value = '' }, 5000)
  } finally { retryLoading.value = false }
}

async function cancelAssessment(assessment: assessmentDomain.AssessmentListItem) {
  if (!confirm(`Cancel AI processing for ${assessment.hcp.firstName} ${assessment.hcp.lastName}? This will reset the assessment to DRAFT.`)) return
  cancelLoading.value = true; formError.value = ''
  try {
    await assessmentDomain.cancelAssessment(assessment.id)
    formError.value = '✓ Assessment cancelled — status reset to DRAFT'
    setTimeout(() => { formError.value = '' }, 5000)
    await fetchAssessments()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to cancel assessment'
    setTimeout(() => { formError.value = '' }, 5000)
  } finally { cancelLoading.value = false }
}

async function cancelSelectedAssessment() {
  if (!selectedAssessment.value) return
  const a = selectedAssessment.value as any
  await cancelAssessment(a)
}

// ─── Diagnostic Info Helpers ─────────────────────────────────────

function getAiResultsArray(): any[] {
  if (!selectedAssessment.value?.aiResults) return []
  if (Array.isArray(selectedAssessment.value.aiResults)) return selectedAssessment.value.aiResults as any[]
  if (typeof selectedAssessment.value.aiResults === 'string' && selectedAssessment.value.aiResults.startsWith('[')) {
    try { return JSON.parse(selectedAssessment.value.aiResults) }
    catch { return [] }
  }
  return []
}

// ─── Template Helpers (same pattern as ReviewView) ────────────────

const PLACEHOLDER_PATTERNS = [
  'Extracted from prose output',
  'Extracted by positional matching'
]

function getAiResultForQuestion(questionId: string): any {
  const results = assessmentDomain.getAiResults(selectedAssessment.value as any)
  return results.find((r: any) => r.questionId === questionId) || null
}

function hasRealRationale(questionId: string): boolean {
  const result = getAiResultForQuestion(questionId)
  if (!result?.rationale) return false
  return !PLACEHOLDER_PATTERNS.some(p => result.rationale.includes(p))
}

const hasDiagnosticInfo = computed(() => getAiResultsArray().some((r: any) => r.questionId === '_diagnostic'))
const diagnosticSnippet = computed(() => {
  const results = getAiResultsArray()
  const diag = results.find((r: any) => r.questionId === '_diagnostic')
  return diag?.rationale || ''
})

// ─── Lifecycle ─────────────────────────────────────────────────────

onMounted(() => { fetchAssessments(); startAutoRefresh() })
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Assessments</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} assessments ({{ statusFilter ? 'filtered' : 'all' }})</p>
        </div>
        <a href="/assessments/new" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium">+ Request Assessment</a>
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
          <template v-if="assessmentDomain.isAdminOrSAUser()">
            <option value="AI_COMPLETE">⚠️ Needs Review</option>
          </template>
          <option v-for="(label, status) in assessmentDomain.StatusLabels" :key="status" :value="status">{{ label }}</option>
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="assessments.length === 0">
              <td colspan="7" class="px-6 py-8 text-center text-sm text-gray-500">No assessments found. Click "Request Assessment" to create one.</td>
            </tr>
            <tr v-for="assessment in assessments" :key="assessment.id" :class="['hover:bg-gray-50', assessmentDomain.isActionRequired(assessment) && assessmentDomain.isAdminOrSAUser() ? 'cursor-pointer' : 'cursor-default']" @click="assessmentDomain.isActionRequired(assessment) && assessmentDomain.isAdminOrSAUser() ? navigateToReview(assessment) : openDetailPanel(assessment)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ assessment.hcp.firstName }} {{ assessment.hcp.lastName }}</div>
                <div v-if="assessment.hcp.email" class="text-xs text-gray-500">{{ assessment.hcp.email }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', assessmentDomain.getStatusColor(assessment.status)]">
                  <svg v-if="assessment.status === 'AI_PROCESSING'" class="animate-spin -ml-1 mr-2 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ assessmentDomain.getStatusLabel(assessment.status) }}
                </span>
                <button v-if="assessmentDomain.isActionRequired(assessment) && assessmentDomain.isAdminOrSAUser()" @click.stop="navigateToReview(assessment)" class="ml-1.5 px-2 py-0.5 animate-pulse inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white">
                  !
                </button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ assessment.specialty?.name || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ assessment.totalScore !== null ? assessment.totalScore : '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ assessmentDomain.formatDate(assessment.submittedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ assessmentDomain.formatDate(assessment.completedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <!-- DRAFT status actions -->
                <template v-if="assessmentDomain.isDraft(assessment)">
                  <button @click="navigateToEditDraft(assessment.id)" class="text-blue-600 hover:text-blue-900 font-medium mr-3">
                    {{ assessmentDomain.isCurrentUser(assessment.submittedByUser.id) ? 'Continue' : 'Edit' }}
                  </button>
                  <button @click.stop="deleteDraft(assessment)" class="text-red-600 hover:text-red-900">Delete</button>
                </template>
                <!-- Non-DRAFT status actions -->
                <template v-else>
                  <!-- UNDER_REVIEW: show review + view buttons -->
                  <template v-if="assessment.status === 'UNDER_REVIEW' && assessmentDomain.isAdminOrSAUser()">
                    <router-link :to="`/assessments/${assessment.id}/review`" class="text-purple-600 hover:text-purple-900 font-medium mr-3">
                      Review
                    </router-link>
                  </template>
                  <!-- AI_PROCESSING: show cancel button + view -->
                  <template v-if="assessment.status === 'AI_PROCESSING'">
                    <button @click.stop="cancelAssessment(assessment)" :disabled="cancelLoading" class="text-red-600 hover:text-red-900 font-medium mr-3">
                      {{ cancelLoading ? 'Cancelling...' : 'Cancel' }}
                    </button>
                  </template>
                  <!-- AI_FAILED: show retry button + view -->
                  <template v-if="assessmentDomain.isFailed(assessment) && assessmentDomain.canRetry(assessment)">
                    <button @click.stop="retryFailedAssessment(assessment)" :disabled="retryLoading" class="text-orange-600 hover:text-orange-900 font-medium mr-3">
                      {{ retryLoading ? 'Retrying...' : 'Retry' }}
                    </button>
                  </template>
                  <button @click="openDetailPanel(assessment)" class="text-blue-600 hover:text-blue-900">View</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div class="text-sm text-gray-500">Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ Math.min(currentPage * pageSize, totalCount) }} of {{ totalCount }} results</div>
          <div class="flex space-x-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Previous</button>
            <template v-for="p in Math.min(5, totalPages)" :key="p">
              <button @click="goToPage(p)" :class="['px-3 py-1 border rounded text-sm', p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50']">{{ p }}</button>
            </template>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages" class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
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
                <div v-if="showDetailPanel && selectedAssessment" class="w-full h-full flex flex-col bg-white shadow-xl">
                  <!-- Panel Header -->
                  <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h3 class="text-lg font-semibold text-gray-900">Assessment Details</h3>
                    <button @click="closeDetailPanel" class="text-gray-400 hover:text-gray-600">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <!-- Panel Content -->
                  <div class="flex-1 overflow-y-auto p-6">
                    <!-- HCP Info -->
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">HCP</h4>
                      <p class="text-sm font-semibold text-gray-900">{{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}</p>
                      <p v-if="selectedAssessment.hcp.email" class="text-sm text-gray-600">{{ selectedAssessment.hcp.email }}</p>
                    </div>

                    <!-- Status -->
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</h4>
                      <div class="flex items-center">
                        <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', assessmentDomain.getStatusColor(selectedAssessment.status)]">
                          {{ assessmentDomain.getStatusLabel(selectedAssessment.status) }}
                        </span>
                        <!-- Cancel button for AI_PROCESSING -->
                        <button v-if="selectedAssessment.status === 'AI_PROCESSING'" @click.stop="cancelSelectedAssessment()" :disabled="cancelLoading" class="ml-2 text-xs text-red-600 hover:text-red-900 underline">
                          {{ cancelLoading ? 'Cancelling...' : 'Cancel' }}
                        </button>
                      </div>
                    </div>

                    <!-- Score -->
                    <div v-if="selectedAssessment.totalScore !== null" class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Score</h4>
                      <p class="text-2xl font-bold text-gray-900">{{ selectedAssessment.totalScore }}</p>
                    </div>

                    <!-- AI Failed Error Display -->
                    <div v-if="assessmentDomain.isFailed(selectedAssessment)" class="mb-4">
                      <h4 class="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1 flex items-center">
                        <svg class="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                        AI Processing Failed
                      </h4>
                      <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <!-- Show error messages (filter out diagnostic entries) -->
                        <template v-if="getAiResultsArray().length > 0">
                          <p v-for="(err, idx) in getAiResultsArray().filter((r: any) => r.questionId !== '_diagnostic')" :key="idx" class="text-sm text-red-700">
                            {{ err.rationale || err.error || JSON.stringify(err) }}
                          </p>
                          <!-- Diagnostic toggle -->
                          <button v-if="hasDiagnosticInfo" @click="showDiagnosticInfo = !showDiagnosticInfo" class="mt-2 text-xs text-red-600 hover:text-red-800 underline">
                            {{ showDiagnosticInfo ? 'Hide' : 'Show' }} diagnostic info (raw LLM output)
                          </button>
                          <pre v-if="showDiagnosticInfo && hasDiagnosticInfo" class="mt-2 p-2 bg-white border border-red-200 rounded text-xs text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">{{ diagnosticSnippet }}</pre>
                        </template>
                        <p v-else class="text-sm text-red-700">The LLM returned an invalid or empty response. Check that Ollama is running with qwen3.6-35b-a3b loaded.</p>
                      </div>
                    </div>

                    <!-- AI Results -->
                    <div v-if="selectedAssessment.criteriaSet?.questions && selectedAssessment.aiResults" class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Evaluation Results</h4>

                      <!-- View Mode (read-only AI results display) -->
                      <div v-if="selectedAssessment.status === 'AI_COMPLETE' || selectedAssessment.status === 'UNDER_REVIEW'" class="space-y-1.5">
                        <div v-for="(question, index) in selectedAssessment.criteriaSet.questions" :key="question.id" class="p-2.5 bg-purple-50 rounded border border-purple-100">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-1.5 mb-0.5">
                                <span class="text-xs font-semibold text-purple-700">Q{{ index + 1 }}</span>
                                <span class="text-xs text-gray-600 truncate">{{ question.text }}</span>
                              </div>
                              <div class="flex items-center gap-2 flex-wrap">
                                <span v-if="getAiResultForQuestion(question.id)" class="text-xs text-purple-700">
                                  {{ getAiResultForQuestion(question.id)?.selectedAnswerText }} ({{ getAiResultForQuestion(question.id)?.score ?? 0 }} pts)
                                </span>
                                <span v-else class="text-xs text-gray-400 italic">
                                  No evidence in CV for this question
                                </span>
                                <span v-if="getAiResultForQuestion(question.id)?.isOverride" class="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Override</span>
                              </div>
                              <p v-if="hasRealRationale(question.id)" class="text-xs text-gray-500 mt-1 italic">"{{ getAiResultForQuestion(question.id)?.rationale }}"</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- View Mode (AI Results Display for other statuses) -->
                      <div v-else class="space-y-1.5">
                        <div v-for="(question, index) in selectedAssessment.criteriaSet.questions" :key="question.id" class="p-2.5 bg-gray-50 rounded border border-gray-200">
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-1.5 mb-0.5">
                                <span class="text-xs font-semibold text-gray-600">Q{{ index + 1 }}</span>
                                <span class="text-xs text-gray-500 truncate">{{ question.text }}</span>
                              </div>
                              <div class="flex items-center gap-2 flex-wrap">
                                <span v-if="getAiResultForQuestion(question.id)" class="text-xs text-blue-600">
                                  {{ getAiResultForQuestion(question.id)?.selectedAnswerText }} ({{ getAiResultForQuestion(question.id)?.score ?? 0 }} pts)
                                </span>
                                <span v-else class="text-xs text-gray-400 italic">
                                  No evidence in CV for this question
                                </span>
                                <span v-if="getAiResultForQuestion(question.id)?.isOverride" class="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Override</span>
                              </div>
                              <p v-if="hasRealRationale(question.id)" class="text-xs text-gray-500 mt-1 italic">{{ getAiResultForQuestion(question.id)?.rationale }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                  <!-- AI Audit (raw LLM data for review) -->
                  <template v-if="selectedAssessment.llmRawResponse || selectedAssessment.llmUserPrompt">
                    <div class="mt-4 border-t border-gray-200 pt-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Audit</h4>
                      <!-- Raw LLM Response -->
                      <div v-if="selectedAssessment.llmRawResponse" class="mb-3">
                        <button @click="showRawResponse = !showRawResponse" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          {{ showRawResponse ? 'Hide' : 'Show' }} raw LLM response ({{ selectedAssessment.llmRawResponse.length }} chars)
                        </button>
                        <pre v-if="showRawResponse" class="mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">{{ selectedAssessment.llmRawResponse }}</pre>
                      </div>
                      <!-- User Prompt -->
                      <div v-if="selectedAssessment.llmUserPrompt">
                        <button @click="showRawPrompt = !showRawPrompt" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          {{ showRawPrompt ? 'Hide' : 'Show' }} user prompt sent to AI ({{ selectedAssessment.llmUserPrompt.length }} chars)
                        </button>
                        <pre v-if="showRawPrompt" class="mt-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">{{ selectedAssessment.llmUserPrompt }}</pre>
                      </div>
                    </div>
                  </template>

                  <!-- Tier & Rate (approved) -->
                  <template v-if="selectedAssessment.status === 'APPROVED'">
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tier & Rate</h4>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                          <h4 class="text-xs font-semibold text-green-700 mb-1">Tier</h4>
                          <p class="text-sm font-semibold text-gray-900">{{ selectedAssessment.tierLabel || '—' }}</p>
                        </div>
                        <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                          <h4 class="text-xs font-semibold text-green-700 mb-1">Rate</h4>
                          <p class="text-sm font-semibold text-gray-900">${{ selectedAssessment.rate?.toFixed(2) || '—' }}</p>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- Dates -->
                  <div v-if="selectedAssessment.createdAt || selectedAssessment.submittedAt || selectedAssessment.effectiveDate" class="mb-4">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dates</h4>
                    <div class="grid grid-cols-3 gap-3">
                      <div v-if="selectedAssessment.createdAt">
                        <p class="text-xs text-gray-500 mb-0.5">Created</p>
                        <p class="text-sm font-medium text-gray-900">{{ assessmentDomain.formatDate(selectedAssessment.createdAt) }}</p>
                      </div>
                      <div v-if="selectedAssessment.submittedAt">
                        <p class="text-xs text-gray-500 mb-0.5">Submitted</p>
                        <p class="text-sm font-medium text-gray-900">{{ assessmentDomain.formatDate(selectedAssessment.submittedAt) }}</p>
                      </div>
                      <div v-if="selectedAssessment.effectiveDate">
                        <p class="text-xs text-gray-500 mb-0.5">Effective</p>
                        <p class="text-sm font-medium text-gray-900">{{ assessmentDomain.formatDate(selectedAssessment.effectiveDate) }}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Rejection Reason -->
                  <div v-if="selectedAssessment.rejectionReason" class="mb-4">
                    <h4 class="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Rejection Reason</h4>
                    <p class="text-sm text-gray-900 bg-red-50 p-3 rounded-lg">{{ selectedAssessment.rejectionReason }}</p>
                  </div>

                  <!-- Submitted By -->
                  <div v-if="selectedAssessment.submittedByUser?.email" class="mb-4">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Submitted By</h4>
                    <p class="text-sm font-medium text-gray-900">{{ selectedAssessment.submittedByUser.email }}</p>
                  </div>

                  <!-- Start Review / Continue Review Button -->
                  <div v-if="assessmentDomain.canReview(selectedAssessment) || selectedAssessment.status === 'UNDER_REVIEW'" class="mt-4 border-t border-gray-200 pt-4">
                    <router-link :to="`/assessments/${selectedAssessment.id}/review`" class="block w-full text-center px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors">
                      {{ selectedAssessment.status === 'UNDER_REVIEW' ? 'Continue Review' : 'Start Review' }}
                    </router-link>
                  </div>

                  <!-- Approve Section -->
                  <div v-if="assessmentDomain.canApprove(selectedAssessment)" class="mt-4 border-t border-gray-200 pt-4">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approve Assessment</h4>
                    <div v-if="reviewError" class="mb-3 bg-red-50 border border-red-200 rounded-lg p-3"><p class="text-sm text-red-600">{{ reviewError }}</p></div>

                    <div class="mb-3">
                      <label for="approve-tier" class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tier</label>
                      <select id="approve-tier" v-model="approveTierId" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="">Auto-assign based on score</option>
                        <option v-for="tier in availableTiers" :key="tier.id" :value="tier.id">{{ tier.name }}</option>
                      </select>
                    </div>

                    <div class="mb-3">
                      <label for="rate-override" class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rate Override</label>
                      <input id="rate-override" v-model="approveRateOverride" type="number" step="0.01" placeholder="Override calculated rate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>

                    <div class="mb-3">
                      <label for="approve-rationale" class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rationale</label>
                      <textarea id="approve-rationale" v-model="approveRationale" rows="2" placeholder="Explain approval decision..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
                    </div>

                    <button @click="approveAssessment" :disabled="isApproving || isRejecting" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                      {{ isApproving ? 'Processing...' : 'Approve Assessment' }}
                    </button>
                  </div>

                  <!-- Reject Section (UNDER_REVIEW status) -->
                  <div v-if="assessmentDomain.canReject(selectedAssessment)" class="mt-4 border-t border-gray-200 pt-4">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Reject Assessment</h4>
                    <div v-if="reviewError" class="mb-3 bg-red-50 border border-red-200 rounded-lg p-3"><p class="text-sm text-red-600">{{ reviewError }}</p></div>

                    <div class="mb-3">
                      <label for="reject-reason" class="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Rejection Reason *</label>
                      <textarea id="reject-reason" v-model="rejectionReason" rows="3" placeholder="Provide detailed reason for rejection..." required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"></textarea>
                    </div>

                    <button @click="rejectAssessment" :disabled="isRejecting || isApproving" class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                      {{ isRejecting ? 'Processing...' : 'Reject Assessment' }}
                    </button>
                  </div>

                  <!-- DRAFT Assessment Actions -->
                  <div v-if="assessmentDomain.isDraft(selectedAssessment)" class="px-6 border-t border-gray-200 pt-4 pb-4 mb-4">
                    <h4 class="text-sm font-medium text-gray-900 mb-3">Draft Assessment</h4>
                    <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p class="text-xs text-blue-700 font-medium mb-1">Draft Status</p>
                      <p class="text-sm text-gray-700">{{ selectedAssessment.cvText ? `CV uploaded (${selectedAssessment.cvText.length} chars)` : 'No CV uploaded yet' }} · HCP: {{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}</p>
                    </div>

                    <div class="space-y-2">
                      <button @click="navigateToEditDraft(selectedAssessment.id)" class="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">
                        {{ assessmentDomain.isCurrentUser(selectedAssessment.submittedByUser.id) ? 'Continue Assessment' : 'Edit Draft Assessment' }}
                      </button>
                      <button @click="deleteDraft(selectedAssessment)" class="w-full px-4 py-2.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors">Delete Draft</button>
                    </div>
                  </div>
                </div>

                  <!-- Panel Footer -->
                  <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-2">
                    <!-- Retry button for AI_FAILED assessments -->
                    <button v-if="assessmentDomain.isFailed(selectedAssessment) && assessmentDomain.canRetry(selectedAssessment)" @click.stop="retryFailedAssessment(selectedAssessment); closeDetailPanel()" :disabled="retryLoading" class="block w-full text-center px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium">
                      {{ retryLoading ? 'Retrying...' : 'Retry AI Processing' }}
                    </button>
                    <a href="/assessments/new" class="block w-full text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Request New Assessment</a>
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
.slideover-enter-active, .slideover-leave-active { transition: opacity 0.3s ease; }
.slideover-enter-from, .slideover-leave-to { opacity: 0; }
.slideover-panel-enter-active, .slideover-panel-leave-active { transition: transform 0.3s ease; }
.slideover-panel-enter-from, .slideover-panel-leave-to { transform: translateX(100%); }
</style>
