<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface AssessmentListItem {
  id: string
  hcp: { firstName: string; lastName: string; email?: string }
  submittedByUser: { id: string; email: string }
  specialtyId?: string
  criteriaSetId?: string
  status: string
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

function openDetailPanel(assessment: AssessmentListItem) {
  selectedAssessment.value = assessment
  showDetailPanel.value = true
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedAssessment.value = null
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
let refreshInterval: ReturnType<typeof setInterval> | null = null

function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    const hasProcessing = assessments.value.some(a => a.status === 'AI_PROCESSING')
    if (hasProcessing) {
      fetchAssessments()
    }
  }, 30000) // Every 30 seconds
}

onMounted(() => {
  fetchAssessments()
  startAutoRefresh()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-900">FMV AI Platform</h1>
        <nav class="flex space-x-4">
          <a href="/" class="text-sm text-gray-600 hover:text-gray-900">Dashboard</a>
          <a href="/assessments" class="text-sm font-medium text-blue-600">Assessments</a>
        </nav>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Assessments</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} assessments ({{ statusFilter ? 'filtered' : 'all' }})</p>
        </div>
        <a
          href="/assessments/new"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          + Request Assessment
        </a>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showDetailPanel" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Filters -->
      <div class="mb-6 flex items-center space-x-4">
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="Search by HCP name..."
          class="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          v-model="statusFilter"
          @change="handleSearch"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
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
            <tr v-for="assessment in assessments" :key="assessment.id" class="hover:bg-gray-50 cursor-pointer" @click="openDetailPanel(assessment)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ assessment.hcp.firstName }} {{ assessment.hcp.lastName }}</div>
                <div v-if="assessment.hcp.email" class="text-xs text-gray-500">{{ assessment.hcp.email }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(assessment.status)]">
                  <!-- Processing spinner -->
                  <svg v-if="assessment.status === 'AI_PROCESSING'" class="animate-spin -ml-1 mr-2 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {{ getStatusLabel(assessment.status) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ assessment.totalScore !== null ? assessment.totalScore : '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(assessment.submittedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(assessment.completedAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" @click.stop>
                <button @click="openDetailPanel(assessment)" class="text-blue-600 hover:text-blue-900">View</button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="bg-white px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div class="text-sm text-gray-500">
            Showing {{ ((currentPage - 1) * pageSize) + 1 }} to {{ Math.min(currentPage * pageSize, totalCount) }} of {{ totalCount }} results
          </div>
          <div class="flex space-x-2">
            <button @click="goToPage(currentPage - 1)" :disabled="currentPage === 1" class="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50">Previous</button>
            <template v-for="p in Math.min(5, totalPages)" :key="p">
              <button @click="goToPage(p)" :class="[
                'px-3 py-1 border rounded text-sm',
                p === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
              ]">{{ p }}</button>
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
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <!-- Panel Content -->
                  <div class="flex-1 overflow-y-auto p-6 space-y-4">
                    <!-- HCP Info -->
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">HCP</h4>
                      <p class="text-base font-semibold text-gray-900">{{ selectedAssessment.hcp.firstName }} {{ selectedAssessment.hcp.lastName }}</p>
                      <p v-if="selectedAssessment.hcp.email" class="text-sm text-gray-600">{{ selectedAssessment.hcp.email }}</p>
                    </div>

                    <!-- Status -->
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-2">Status</h4>
                      <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(selectedAssessment.status)]">
                        {{ getStatusLabel(selectedAssessment.status) }}
                      </span>
                    </div>

                    <!-- Score -->
                    <div v-if="selectedAssessment.totalScore !== null">
                      <h4 class="text-sm font-medium text-gray-500 mb-1">Total Score</h4>
                      <p class="text-2xl font-bold text-gray-900">{{ selectedAssessment.totalScore }}</p>
                    </div>

                    <!-- AI Results -->
                    <div v-if="selectedAssessment.aiResults && Object.keys(selectedAssessment.aiResults).length > 0">
                      <h4 class="text-sm font-medium text-gray-500 mb-2">AI Evaluation Results</h4>
                      <div class="space-y-3">
                        <div v-for="(result, index) in selectedAssessment.aiResults" :key="index" class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <p class="text-sm font-medium text-gray-900">{{ result.questionText || `Question ${index + 1}` }}</p>
                          <p class="text-xs text-blue-600 mt-1">Selected: {{ result.selectedAnswerText || '—' }} ({{ result.score ?? '?' }} pts)</p>
                          <p v-if="result.rationale" class="text-xs text-gray-600 mt-1 italic">{{ result.rationale }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Dates -->
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <h4 class="text-sm font-medium text-gray-500 mb-1">Created</h4>
                        <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.createdAt) }}</p>
                      </div>
                      <div>
                        <h4 class="text-sm font-medium text-gray-500 mb-1">Submitted</h4>
                        <p class="text-sm text-gray-900">{{ formatDate(selectedAssessment.submittedAt) }}</p>
                      </div>
                    </div>

                    <!-- Rejection Reason -->
                    <div v-if="selectedAssessment.rejectionReason">
                      <h4 class="text-sm font-medium text-red-600 mb-1">Rejection Reason</h4>
                      <p class="text-sm text-gray-900 bg-red-50 p-3 rounded-lg">{{ selectedAssessment.rejectionReason }}</p>
                    </div>

                    <!-- Submitted By -->
                    <div>
                      <h4 class="text-sm font-medium text-gray-500 mb-1">Submitted By</h4>
                      <p class="text-sm text-gray-900">{{ selectedAssessment.submittedByUser.email }}</p>
                    </div>
                  </div>

                  <!-- Panel Footer -->
                  <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
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
