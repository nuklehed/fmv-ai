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
const groupedByHcp = ref(false)

// ─── Detail Panel State ──────────────────────────────────────────

interface FullAssessment extends assessmentDomain.AssessmentListItem {
  criteriaSet?: { questions: Array<{ id: string; text: string; answers: Array<{ id: string; text: string; score: number }> }> }
}

const selectedAssessment = ref<FullAssessment | null>(null)
const detailLoading = ref(false)
const showDetailPanel = ref(false)



// ─── List Operations ─────────────────────────────────────────────

async function fetchAssessments() {
  loading.value = true
  try {
    const result = await assessmentDomain.fetchAssessments({
      page: currentPage.value, limit: pageSize.value,
      search: searchQuery.value || undefined, statusFilter: statusFilter.value || undefined,
      groupedByHcp: groupedByHcp.value
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

function toggleGroupByHcp() {
  groupedByHcp.value = !groupedByHcp.value
  currentPage.value = 1
  fetchAssessments()
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

// ─── Actions Menu (kebab dropdown per row) ───────────────────────

type ActionMenuItem =
  | { label: string; icon: string; command?: (() => void) | undefined; routerLink?: string | undefined }
  | { separator: true }

// ─── Actions Menu (click-positioned overlay) ─────────────────────

interface MenuPosition {
  top: string
  left: string
}

const menuOpen = ref(false)
const menuAssessment = ref<assessmentDomain.AssessmentListItem | null>(null)
const menuPos = ref<MenuPosition>({ top: '0px', left: '0px' })

function buildMenuItems(assessment: assessmentDomain.AssessmentListItem): ActionMenuItem[] {
  const items: ActionMenuItem[] = []

  if (assessmentDomain.isDraft(assessment)) {
    items.push({ label: assessmentDomain.isCurrentUser(assessment.submittedByUser.id) ? 'Continue' : 'Edit', icon: 'pi pi-pencil', command: () => navigateToEditDraft(assessment.id) })
    items.push({ separator: true })
    items.push({ label: 'Delete', icon: 'pi pi-trash', command: () => deleteDraft(assessment) })
  } else {
    // Profile (BU+ only)
    if (assessmentDomain.hasBuRole()) {
      items.push({ label: 'Profile', icon: 'pi pi-user', routerLink: `/hcp/${assessment.hcp.id}/profile` })
    }
    // Review
    if (assessment.status === 'UNDER_REVIEW' && assessmentDomain.isAdminOrSAUser()) {
      items.push({ label: 'Review', icon: 'pi pi-check-circle', routerLink: `/assessments/${assessment.id}/review` })
    }
    // Cancel / Retry
    if (assessment.status === 'AI_PROCESSING') {
      items.push({ label: 'Cancel', icon: 'pi pi-times', command: () => cancelAssessment(assessment) })
    }
    if (assessmentDomain.isFailed(assessment) && assessmentDomain.canRetry(assessment)) {
      items.push({ label: 'Retry', icon: 'pi pi-sync', command: () => retryFailedAssessment(assessment) })
    }
    // View details
    items.push({ separator: true })
    items.push({ label: 'View Details', icon: 'pi pi-eye', command: () => openDetailPanel(assessment) })
  }

  return items
}

function toggleMenu(event: Event, assessment: assessmentDomain.AssessmentListItem): void {
  if (menuOpen.value && menuAssessment.value?.id === assessment.id) {
    // Close if same row clicked again
    menuOpen.value = false
    return
  }
  const tdRect = (event.target as HTMLElement).closest('td')?.getBoundingClientRect()
  const btnRect = (event.target as HTMLElement).getBoundingClientRect()
  if (tdRect && btnRect) {
    // Fixed positioning is viewport-relative, so use getBoundingClientRect() directly
    menuPos.value = { top: `${btnRect.bottom}px`, left: `${Math.min(btnRect.right - 160, tdRect.right - 160)}px` }
  }
  menuAssessment.value = assessment
  menuOpen.value = true
}

function handleMenuAction(item: ActionMenuItem): void {
  if ('separator' in item) return
  if (item.routerLink) {
    router.push(item.routerLink)
  } else if (item.command) {
    item.command()
  }
}

function closeMenu(): void {
  menuOpen.value = false
}

// Close menu on outside click
document.addEventListener('click', (e) => {
  if (menuOpen.value && !(e.target as HTMLElement).closest('[data-menu-btn]')) closeMenu()
})

// ─── Detail Panel ────────────────────────────────────────────────

async function openDetailPanel(assessment: assessmentDomain.AssessmentListItem) {
  detailLoading.value = true
  showDetailPanel.value = true

  try {
    const full = await assessmentDomain.fetchAssessment(assessment.id)
    selectedAssessment.value = full as unknown as FullAssessment
  } catch { /* keep the list item as fallback */ }

  detailLoading.value = false
}

function closeDetailPanel() {
  showDetailPanel.value = false; selectedAssessment.value = null
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
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 mb-1">Assessments</h2>
          <p class="text-sm text-slate-600">{{ totalCount.toLocaleString() }} {{ groupedByHcp ? 'active records (one per HCP)' : 'assessments' }} ({{ statusFilter ? 'filtered' : 'all' }})</p>
        </div>
        <router-link :to="{ name: 'assessmentNew' }" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium">+ Request Assessment</router-link>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showDetailPanel" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex items-center space-x-4">
        <input v-model="searchQuery" @input="onSearchInput" type="text" placeholder="Search by HCP name..."
          class="flex-1 max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        <select v-model="statusFilter" @change="handleSearch"
          class="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 form-select">
          <option value="">All Statuses</option>
          <template v-if="assessmentDomain.isAdminOrSAUser()">
            <option value="AI_COMPLETE">Needs Review</option>
          </template>
          <option v-for="(label, status) in assessmentDomain.StatusLabels" :key="status" :value="status">{{ label }}</option>
        </select>
        <button @click="toggleGroupByHcp"
          :class="['px-3 py-2 border rounded-lg text-sm font-medium transition-colors',
            groupedByHcp
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50']">
          {{ groupedByHcp ? '☑ Grouped by HCP' : 'Group by HCP' }}
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-slate-500">Loading assessments...</p>
      </div>

      <!-- Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">HCP</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Specialty</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Score</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Submitted</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Completed</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <tr v-if="assessments.length === 0">
              <td colspan="7" class="px-6 py-8 text-center text-sm text-slate-500">No assessments found. Click "Request Assessment" to create one.</td>
            </tr>
            <tr v-for="assessment in assessments" :key="assessment.id" :class="['hover:bg-slate-50', assessmentDomain.isActionRequired(assessment) && assessmentDomain.isAdminOrSAUser() ? 'cursor-pointer' : 'cursor-default']" @click="assessmentDomain.isActionRequired(assessment) && assessmentDomain.isAdminOrSAUser() ? navigateToReview(assessment) : openDetailPanel(assessment)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-slate-900">{{ assessment.hcp.firstName }} {{ assessment.hcp.lastName }}</div>
                <div v-if="assessment.hcp.email" class="text-xs text-slate-500">{{ assessment.hcp.email }}</div>
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
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{{ assessment.specialty?.name || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{{ assessment.totalScore !== null ? assessment.totalScore : '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{{ assessmentDomain.formatDate(assessment.submittedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{{ assessmentDomain.formatDate(assessment.completedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <!-- Kebab menu button (one icon per row) -->
                <button @click.stop="toggleMenu($event, assessment)" data-menu-btn
                  class="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <i class="pi pi-ellipsis-v"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination (hidden in grouped mode — all unique HCPs returned on one page) -->
        <div v-if="!groupedByHcp && totalPages > 1" class="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <div class="text-sm text-slate-500">Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ Math.min(currentPage * pageSize, totalCount) }} of {{ totalCount }} results</div>
          <div class="flex space-x-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Previous</button>
            <template v-for="p in Math.min(5, totalPages)" :key="p">
              <button @click="goToPage(p)" :class="['px-3 py-1 border rounded text-sm', p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-50']">{{ p }}</button>
            </template>
            <button @click="goToPage(currentPage + 1)" :disabled="currentPage === totalPages" class="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50">Next</button>
          </div>
        </div>
      </div>

      <!-- ─── Detail Slide-over Panel ────────────────────────────── -->
      <Teleport to="body">
        <Transition name="slideover">
          <div v-if="showDetailPanel && selectedAssessment" class="fixed inset-0 z-50 overflow-hidden">
            <div class="absolute inset-0 bg-slate-500 bg-opacity-75 transition-opacity" @click="closeDetailPanel" />

            <div class="fixed inset-y-0 right-0 max-w-lg w-full flex">
              <Transition name="slideover-panel">
                <div v-if="showDetailPanel && selectedAssessment" class="w-full h-full flex flex-col bg-white shadow-xl">
                  <!-- Panel Header -->
                  <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <h3 class="text-base font-semibold text-slate-900">Assessment Details</h3>
                    <div class="flex items-center gap-2">
                      <router-link v-if="assessmentDomain.hasBuRole()" :to="`/hcp/${selectedAssessment.hcp.id}/profile`" class="inline-flex items-center px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                        <i class="pi pi-user mr-1"></i>
                        Profile
                      </router-link>
                      <button @click="closeDetailPanel" class="text-slate-400 hover:text-slate-600 p-1">
                        <i class="pi pi-times text-lg"></i>
                      </button>
                    </div>
                  </div>

                  <!-- Panel Content -->
                  <div class="flex-1 overflow-y-auto p-4 space-y-5">
                    <!-- HCP Info -->
                    <div class="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <i class="pi pi-user text-slate-400 text-xl mt-px"></i>
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-slate-500 mb-0.5">HCP</p>
                        <template v-if="assessmentDomain.hasBuRole()">
                          <router-link :to="`/hcp/${selectedAssessment.hcp.id}/profile`" class="text-sm font-semibold text-blue-600 hover:text-blue-800 leading-snug">
                            {{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}
                          </router-link>
                        </template>
                        <p v-else class="text-sm font-medium text-slate-900 leading-snug">{{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}</p>
                        <p v-if="selectedAssessment.hcp.email" class="text-xs text-slate-500">{{ selectedAssessment.hcp.email }}</p>
                      </div>
                    </div>

                    <!-- Status -->
                    <div class="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                      <i class="pi pi-tag text-slate-400 text-xl mt-px"></i>
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-medium text-slate-500 mb-0.5">Status</p>
                        <div class="flex items-center gap-2">
                          <span :class="['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', assessmentDomain.getStatusColor(selectedAssessment.status)]">
                            {{ assessmentDomain.getStatusLabel(selectedAssessment.status) }}
                          </span>
                          <button v-if="selectedAssessment.status === 'AI_PROCESSING'" @click.stop="cancelSelectedAssessment()" :disabled="cancelLoading"
                            class="text-xs text-red-600 hover:text-red-800 underline">
                            {{ cancelLoading ? 'Cancelling...' : 'Cancel' }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Score -->
                    <div v-if="selectedAssessment.totalScore !== null" class="p-3 bg-white border border-slate-200 rounded-lg">
                      <p class="text-xs font-medium text-slate-500 mb-1">Total Score</p>
                      <p class="text-3xl font-bold text-slate-900 leading-tight">{{ selectedAssessment.totalScore }}</p>
                    </div>

                    <!-- AI Failed Error Display -->
                    <div v-if="assessmentDomain.isFailed(selectedAssessment)" class="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div class="flex items-start gap-2 mb-2">
                        <i class="pi pi-exclamation-circle text-red-600 text-lg mt-px"></i>
                        <p class="text-sm font-semibold text-red-900">AI Processing Failed</p>
                      </div>
                      <!-- Show error messages (filter out diagnostic entries) -->
                      <template v-if="getAiResultsArray().length > 0">
                        <div class="space-y-1 mb-2">
                          <p v-for="(err, idx) in getAiResultsArray().filter((r: any) => r.questionId !== '_diagnostic')" :key="idx"
                            class="text-sm text-red-700 leading-snug">
                            {{ err.rationale || err.error || JSON.stringify(err) }}
                          </p>
                        </div>
                        <!-- Diagnostic toggle -->
                        <button v-if="hasDiagnosticInfo" @click="showDiagnosticInfo = !showDiagnosticInfo"
                          class="text-xs text-red-600 hover:text-red-800 underline">
                          {{ showDiagnosticInfo ? 'Hide' : 'Show' }} diagnostic info (raw LLM output)
                        </button>
                        <pre v-if="showDiagnosticInfo && hasDiagnosticInfo"
                          class="mt-2 p-2.5 bg-white border border-red-200 rounded text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {{ diagnosticSnippet }}
                        </pre>
                      </template>
                      <p v-else class="text-sm text-red-700 leading-snug">The LLM returned an invalid or empty response. Check that Ollama is running with qwen3.6-35b-a3b loaded.</p>
                    </div>

                    <!-- AI Results -->
                    <div v-if="selectedAssessment.criteriaSet?.questions && selectedAssessment.aiResults">
                      <h4 class="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                        <i class="pi pi-sparkles text-sm"></i>
                        AI Evaluation Results
                      </h4>

                      <!-- View Mode (read-only AI results display) -->
                      <div v-if="selectedAssessment.status === 'AI_COMPLETE' || selectedAssessment.status === 'UNDER_REVIEW'" class="space-y-2 mb-4">
                        <div v-for="(question, index) in selectedAssessment.criteriaSet.questions" :key="question.id"
                          class="p-3 bg-white border border-slate-200 rounded-lg">
                          <div class="flex items-start gap-2">
                            <span class="text-xs font-semibold text-blue-600 shrink-0 mt-px">Q{{ index + 1 }}</span>
                            <div class="min-w-0 flex-1">
                              <p class="text-sm text-slate-900 leading-snug mb-1.5 truncate">{{ question.text }}</p>
                              <div class="flex items-center gap-2 flex-wrap">
                                <span v-if="getAiResultForQuestion(question.id)" class="text-xs text-slate-700">
                                  {{ getAiResultForQuestion(question.id)?.selectedAnswerText }}
                                  <span class="text-slate-500">({{ getAiResultForQuestion(question.id)?.score ?? 0 }} pts)</span>
                                </span>
                                <span v-else class="text-xs text-slate-400 italic">No evidence in CV for this question</span>
                                <span v-if="getAiResultForQuestion(question.id)?.isOverride"
                                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                  Override
                                </span>
                              </div>
                              <p v-if="hasRealRationale(question.id)" class="text-xs text-slate-500 mt-1 italic">"{{ getAiResultForQuestion(question.id)?.rationale }}"</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- View Mode (AI Results Display for other statuses) -->
                      <div v-else class="space-y-2 mb-4">
                        <div v-for="(question, index) in selectedAssessment.criteriaSet.questions" :key="question.id"
                          class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <div class="flex items-start gap-2">
                            <span class="text-xs font-semibold text-slate-500 shrink-0 mt-px">Q{{ index + 1 }}</span>
                            <div class="min-w-0 flex-1">
                              <p class="text-sm text-slate-900 leading-snug mb-1.5 truncate">{{ question.text }}</p>
                              <div class="flex items-center gap-2 flex-wrap">
                                <span v-if="getAiResultForQuestion(question.id)" class="text-xs text-slate-700">
                                  {{ getAiResultForQuestion(question.id)?.selectedAnswerText }}
                                  <span class="text-slate-500">({{ getAiResultForQuestion(question.id)?.score ?? 0 }} pts)</span>
                                </span>
                                <span v-else class="text-xs text-slate-400 italic">No evidence in CV for this question</span>
                                <span v-if="getAiResultForQuestion(question.id)?.isOverride"
                                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                  Override
                                </span>
                              </div>
                              <p v-if="hasRealRationale(question.id)" class="text-xs text-slate-500 mt-1 italic">{{ getAiResultForQuestion(question.id)?.rationale }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Tier & Rate (approved) -->
                    <template v-if="selectedAssessment.status === 'APPROVED'">
                      <h4 class="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                        <i class="pi pi-dollar text-sm"></i>
                        Tier & Rate
                      </h4>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p class="text-xs font-medium text-green-700 mb-1">Tier</p>
                          <p class="text-sm font-semibold text-slate-900 leading-snug">{{ selectedAssessment.tierLabel || '—' }}</p>
                        </div>
                        <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p class="text-xs font-medium text-green-700 mb-1">Rate</p>
                          <p class="text-sm font-semibold text-slate-900 leading-snug">${{ (selectedAssessment.rate != null ? Number(selectedAssessment.rate) : null)?.toFixed(2) || '—' }}</p>
                        </div>
                      </div>
                    </template>

                    <!-- Dates -->
                    <div v-if="selectedAssessment.createdAt || selectedAssessment.submittedAt || selectedAssessment.effectiveDate">
                      <h4 class="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                        <i class="pi pi-calendar text-sm"></i>
                        Dates
                      </h4>
                      <div class="grid grid-cols-3 gap-3">
                        <div v-if="selectedAssessment.createdAt" class="p-2 bg-white border border-slate-200 rounded-lg">
                          <p class="text-xs text-slate-500 mb-0.5">Created</p>
                          <p class="text-sm font-medium text-slate-900 leading-snug">{{ assessmentDomain.formatDate(selectedAssessment.createdAt) }}</p>
                        </div>
                        <div v-if="selectedAssessment.submittedAt" class="p-2 bg-white border border-slate-200 rounded-lg">
                          <p class="text-xs text-slate-500 mb-0.5">Submitted</p>
                          <p class="text-sm font-medium text-slate-900 leading-snug">{{ assessmentDomain.formatDate(selectedAssessment.submittedAt) }}</p>
                        </div>
                        <div v-if="selectedAssessment.effectiveDate" class="p-2 bg-white border border-slate-200 rounded-lg">
                          <p class="text-xs text-slate-500 mb-0.5">Effective</p>
                          <p class="text-sm font-medium text-slate-900 leading-snug">{{ assessmentDomain.formatDate(selectedAssessment.effectiveDate) }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Rejection Reason -->
                    <div v-if="selectedAssessment.rejectionReason">
                      <h4 class="text-xs font-medium text-red-600 mb-2 flex items-center gap-1.5">
                        <i class="pi pi-times-circle text-sm"></i>
                        Rejection Reason
                      </h4>
                      <p class="text-sm text-slate-900 bg-red-50 p-3 rounded-lg leading-snug">{{ selectedAssessment.rejectionReason }}</p>
                    </div>

                    <!-- Submitted By -->
                    <div v-if="selectedAssessment.submittedByUser?.email">
                      <h4 class="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1.5">
                        <i class="pi pi-user-edit text-sm"></i>
                        Submitted By
                      </h4>
                      <p class="text-sm font-medium text-slate-900">{{ selectedAssessment.submittedByUser.email }}</p>
                    </div>

                    <!-- DRAFT Assessment Actions -->
                    <div v-if="assessmentDomain.isDraft(selectedAssessment)" class="border-t border-slate-200 pt-4">
                      <h4 class="text-sm font-medium text-slate-900 mb-3">Draft Assessment</h4>
                      <div class="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p class="text-xs text-blue-700 font-medium mb-1">Draft Status</p>
                        <p class="text-sm text-slate-700 leading-snug">{{ selectedAssessment.cvText ? `CV uploaded (${selectedAssessment.cvText.length} chars)` : 'No CV uploaded yet' }} · {{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}</p>
                      </div>

                      <div class="space-y-2">
                        <button @click="navigateToEditDraft(selectedAssessment.id)" class="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">
                          <i v-if="assessmentDomain.isCurrentUser(selectedAssessment.submittedByUser.id)" class="pi pi-play mr-1"></i>
                          {{ assessmentDomain.isCurrentUser(selectedAssessment.submittedByUser.id) ? 'Continue Assessment' : 'Edit Draft Assessment' }}
                        </button>
                        <button @click="deleteDraft(selectedAssessment)" class="w-full px-4 py-2.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors">
                          <i class="pi pi-trash mr-1"></i>
                          Delete Draft
                        </button>
                      </div>
                    </div>

                  </div>
                  <!-- Panel Footer -->
                  <div class="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
                    <!-- AI Audit (raw LLM data for review) -->
                    <template v-if="selectedAssessment.llmRawResponse || selectedAssessment.llmUserPrompt">
                      <div>
                        <h4 class="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                          <i class="pi pi-file-edit text-sm"></i>
                          AI Audit
                        </h4>
                        
                        <!-- Raw LLM Response -->
                        <div v-if="selectedAssessment.llmRawResponse" class="mb-1">
                          <button @click="showRawResponse = !showRawResponse"
                            class="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1">
                            <i :class="['pi', showRawResponse ? 'pi-chevron-down' : 'pi-chevron-right', 'text-xs']"></i>
                            Raw LLM response ({{ selectedAssessment.llmRawResponse.length }} chars)
                          </button>
                          <pre v-if="showRawResponse"
                            class="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                            {{ selectedAssessment.llmRawResponse }}
                          </pre>
                        </div>

                        <!-- User Prompt -->
                        <div v-if="selectedAssessment.llmUserPrompt" class="mb-4">
                          <button @click="showRawPrompt = !showRawPrompt"
                            class="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1">
                            <i :class="['pi', showRawPrompt ? 'pi-chevron-down' : 'pi-chevron-right', 'text-xs']"></i>
                            User prompt ({{ selectedAssessment.llmUserPrompt.length }} chars)
                          </button>
                          <pre v-if="showRawPrompt"
                            class="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                            {{ selectedAssessment.llmUserPrompt }}
                          </pre>
                        </div>
                      </div>
                    </template>

                    <!-- Start Review / Continue Review Button -->
                    <div v-if="assessmentDomain.canReview(selectedAssessment) || selectedAssessment.status === 'UNDER_REVIEW'">
                      <router-link :to="`/assessments/${selectedAssessment.id}/review`"
                        class="block w-full text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors">
                        <i class="pi pi-pencil mr-1"></i>
                        {{ selectedAssessment.status === 'UNDER_REVIEW' ? 'Continue Review' : 'Start Review' }}
                      </router-link>
                    </div>

                    <!-- Retry button for AI_FAILED assessments -->
                    <button v-if="assessmentDomain.isFailed(selectedAssessment) && assessmentDomain.canRetry(selectedAssessment)" @click.stop="retryFailedAssessment(selectedAssessment); closeDetailPanel()" :disabled="retryLoading" class="block w-full text-center px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium">
                      <i v-if="!retryLoading" class="pi pi-sync mr-1"></i>
                      {{ retryLoading ? 'Retrying...' : 'Retry AI Processing' }}
                    </button>

                    <!--- Request New Assessment Button -->
                    <router-link :to="{ name: 'assessmentNew', query: { hcpId: selectedAssessment.hcp.id } }" class="block w-full text-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Request New Assessment</router-link>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Actions dropdown overlay -->
      <Teleport to="body">
        <div v-if="menuOpen && menuAssessment" :style="{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999 }"
          class="bg-white rounded-lg shadow-xl border border-slate-200 py-1 w-48">
          <template v-for="(item, idx) in buildMenuItems(menuAssessment)" :key="idx">
            <!-- Separator -->
            <div v-if="'separator' in item" class="border-t border-slate-100 my-1" />
            <!-- Menu item: router link -->
            <router-link v-else-if="item.routerLink" :to="item.routerLink"
              @click="closeMenu()"
              class="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700">
              <i :class="[item.icon, 'w-4 h-4']" />
              {{ item.label }}
            </router-link>
            <!-- Menu item: action command -->
            <button v-else @click.stop="handleMenuAction(item); closeMenu()"
              class="flex items-center gap-2 px-3 py-2 w-full text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700">
              <i :class="[item.icon, 'w-4 h-4']" />
              {{ item.label }}
            </button>
          </template>
        </div>
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
