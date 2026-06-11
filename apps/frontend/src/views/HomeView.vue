<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Assessment } from '@/types'
import * as assessmentDomain from '@/domain/assessment'

const router = useRouter()

// Dashboard state — approved only, grouped by HCP
const assessments = ref<Assessment[]>([])
const loading = ref(false)
const searchQuery = ref('')
const totalCount = ref(0)

// Detail panel state
const selectedAssessment = ref<Assessment | null>(null)
const showDetailPanel = ref(false)


// Dashboard only shows approved, grouped by HCP — no pagination needed
async function fetchAssessments() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (searchQuery.value) params.search = searchQuery.value
    // Dashboard always filters to APPROVED and groups by HCP for one record per person
    params.status = 'APPROVED'
    params.groupedByHcp = 'true'

    const queryString = new URLSearchParams(params).toString()
    const url = `/api/assessments?${queryString}`
    const response = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } })
    const result = await response.json() as { data: Assessment[]; pagination: { totalCount: number; totalPages: number } }

    assessments.value = result.data || []
    totalCount.value = result.pagination?.totalCount || 0
  } catch (error) {
    console.error('Error fetching assessments:', error)
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

function getExpiryUrgency(renewalDate?: string | null): { color: string; label: string } | null {
  if (!renewalDate) return null
  
  const now = new Date()
  const renewal = new Date(renewalDate)
  const daysUntilExpiry = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysUntilExpiry < 0) {
    return { color: 'bg-red-100 text-red-800', label: `Expired ${Math.abs(daysUntilExpiry)}d ago` }
  } else if (daysUntilExpiry <= 30) {
    return { color: 'bg-red-100 text-red-800', label: `${daysUntilExpiry} days left` }
  } else if (daysUntilExpiry <= 60) {
    return { color: 'bg-yellow-100 text-yellow-800', label: `${daysUntilExpiry} days left` }
  } else {
    return { color: 'bg-green-100 text-green-800', label: `${daysUntilExpiry} days left` }
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchAssessments(), 300)
}

async function openDetailPanel(assessment: Assessment) {
  selectedAssessment.value = assessment
  showDetailPanel.value = true
}



function closeDetailPanel() {
  showDetailPanel.value = false
  selectedAssessment.value = null
}

function viewHcpProfile(assessment: Assessment) {
  const hcpId = (assessment as any).hcp?.id || assessment.hcpId
  if (!hcpId) return
  router.push(`/hcp/${hcpId}/profile`)
}

onMounted(() => {
  fetchAssessments()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Dashboard Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
          <p class="text-sm text-gray-600">{{ totalCount }} active approvals (one per HCP)</p>
        </div>
        <a
          href="/assessments/new"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          + Request Assessment
        </a>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white shadow rounded-lg p-4 border-l-4 border-green-500">
          <p class="text-sm text-gray-500">Active Approvals</p>
          <p class="text-2xl font-bold text-gray-900">{{ totalCount }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4 border-l-4 border-red-500">
          <p class="text-sm text-gray-500">Expiring Soon</p>
          <p class="text-2xl font-bold text-gray-900">{{ assessments.filter(a => { const u = getExpiryUrgency(a.renewalDate); return u && (u.label.includes('days left') || u.label.includes('Expired')) }).length }}</p>
        </div>
        <a href="/assessments" class="bg-white shadow rounded-lg p-4 border-l-4 border-blue-500 hover:bg-gray-50 cursor-pointer flex items-center">
          <div>
            <p class="text-sm text-gray-500">All Requests</p>
            <p class="text-lg font-bold text-blue-700">Go to Assessments →</p>
          </div>
        </a>
      </div>

      <!-- Search -->
      <div class="mb-6 flex items-center space-x-4">
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="Search by HCP name..."
          class="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
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
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renewal</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="assessments.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
                No active approvals found. Click "Request Assessment" to create one.
              </td>
            </tr>
            <tr v-for="assessment in assessments" :key="assessment.id" class="hover:bg-gray-50 cursor-pointer" @click="openDetailPanel(assessment)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ (assessment as any).hcp?.firstName || '—' }} {{ (assessment as any).hcp?.lastName || '—' }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {{ assessment.totalScore !== null ? assessment.totalScore : '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ (assessment as any).tierLabel || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${{ assessment.rate?.toFixed(2) || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span v-if="assessment.renewalDate" :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getExpiryUrgency(assessment.renewalDate)?.color || 'bg-gray-100 text-gray-800']">
                  {{ getExpiryUrgency(assessment.renewalDate)?.label }}
                </span>
                <span v-else class="text-xs text-gray-400">—</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <button @click="viewHcpProfile(assessment)" class="text-purple-600 hover:text-purple-900 mr-2">Profile</button>
                <button @click="openDetailPanel(assessment)" class="text-blue-600 hover:text-blue-900">View</button>
              </td>
            </tr>
          </tbody>
        </table>

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
                  <div class="flex-1 overflow-y-auto p-6">
                    <!-- HCP Info -->
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">HCP</h4>
                      <div class="flex items-center space-x-2">
                        <p class="text-sm font-semibold text-gray-900">{{ (selectedAssessment as any).hcp?.firstName || '—' }} {{ (selectedAssessment as any).hcp?.lastName || '—' }}</p>
                        <button v-if="(selectedAssessment as any).hcp?.id" @click.stop="viewHcpProfile(selectedAssessment)" class="text-xs text-purple-600 hover:text-purple-900 underline">
                          View Profile
                        </button>
                      </div>
                    </div>

                    <!-- Status -->
                    <div class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</h4>
                      <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(selectedAssessment.status)]">
                        {{ getStatusLabel(selectedAssessment.status) }}
                      </span>
                    </div>

                    <!-- Score -->
                    <div v-if="selectedAssessment.totalScore !== null" class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Total Score</h4>
                      <p class="text-2xl font-bold text-gray-900">{{ selectedAssessment.totalScore }}</p>
                    </div>

                    <!-- Approved: Tier & Rate -->
                    <template v-if="selectedAssessment.status === 'APPROVED'">
                      <div class="mb-4">
                        <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tier & Rate</h4>
                        <div class="grid grid-cols-2 gap-3">
                          <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                            <h4 class="text-xs font-semibold text-green-700 mb-1">Tier</h4>
                            <p class="text-sm font-semibold text-gray-900">{{ (selectedAssessment as any).tierLabel || '—' }}</p>
                          </div>
                          <div class="p-3 bg-green-50 rounded-lg border border-green-200">
                            <h4 class="text-xs font-semibold text-green-700 mb-1">Rate</h4>
                            <p class="text-sm font-semibold text-gray-900">${{ selectedAssessment.rate?.toFixed(2) || '—' }}</p>
                          </div>
                        </div>
                      </div>
                      <div v-if="selectedAssessment.renewalDate" class="mb-4 p-3 rounded-lg border" :class="getExpiryUrgency(selectedAssessment.renewalDate)?.color || 'bg-gray-50 border-gray-200'">
                        <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Renewal Status</h4>
                        <p class="text-sm">{{ getExpiryUrgency(selectedAssessment.renewalDate)?.label }}</p>
                      </div>
                    </template>

                    <!-- Dates -->
                    <div v-if="selectedAssessment.createdAt || selectedAssessment.submittedAt || selectedAssessment.effectiveDate" class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Dates</h4>
                      <div class="grid grid-cols-3 gap-3">
                        <div v-if="selectedAssessment.createdAt">
                          <p class="text-xs text-gray-500 mb-0.5">Created</p>
                          <p class="text-sm font-medium text-gray-900">{{ formatDate(selectedAssessment.createdAt) }}</p>
                        </div>
                        <div v-if="selectedAssessment.submittedAt">
                          <p class="text-xs text-gray-500 mb-0.5">Submitted</p>
                          <p class="text-sm font-medium text-gray-900">{{ formatDate(selectedAssessment.submittedAt) }}</p>
                        </div>
                        <div v-if="selectedAssessment.effectiveDate">
                          <p class="text-xs text-gray-500 mb-0.5">Effective</p>
                          <p class="text-sm font-medium text-gray-900">{{ formatDate(selectedAssessment.effectiveDate) }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Rejection Reason -->
                    <div v-if="selectedAssessment.rejectionReason" class="mb-4">
                      <h4 class="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Rejection Reason</h4>
                      <p class="text-sm text-gray-900 bg-red-50 p-3 rounded-lg">{{ selectedAssessment.rejectionReason }}</p>
                    </div>

                    <!-- Submitted By -->
                    <div v-if="(selectedAssessment as any).submittedByUser?.email" class="mb-4">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Submitted By</h4>
                      <p class="text-sm font-medium text-gray-900">{{ (selectedAssessment as any).submittedByUser.email }}</p>
                    </div>
                  </div>

                  <!-- Panel Footer -->
                  <div class="px-6 py-4 border-t border-gray-200 bg-gray-50 space-y-3">
                    <button @click.stop="viewHcpProfile(selectedAssessment)" v-if="(selectedAssessment as any).hcp?.id" class="block w-full text-center px-4 py-2.5 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 text-sm font-medium">
                      HCP Profile
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

.notification-dropdown-enter-active, .notification-dropdown-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.notification-dropdown-enter-from, .notification-dropdown-leave-to { 
  opacity: 0; 
  transform: translateY(-10px); 
}
</style>
