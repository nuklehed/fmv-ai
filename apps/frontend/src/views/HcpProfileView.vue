<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as assessmentDomain from '@/domain/assessment'

const router = useRouter()
const route = useRoute()

// ─── State ──────────────────────────────────────────────────────

interface ProfileAssessment extends assessmentDomain.AssessmentListItem {
  criteriaSnapshot?: Record<string, unknown> | null
  isActive?: boolean
  supersededAt?: string | null
  criteriaSetName?: string | null
}

const hcpId = computed(() => String(route.params.id))
const loading = ref(true)
const profileError = ref('')
const page = ref(1)
const limit = ref(20)
const totalAssessments = ref(0)
const totalPages = ref(0)

interface ProfileData {
  hcp: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    state: string | null
    country: string
    specialtyId: string | null
    specialtyName: string | null
    identifiers: Array<{ type: string; value: string }>
    currentStatus: string | null
    createdAt?: string
    updatedAt?: string
  }
  assessments: ProfileAssessment[]
  pagination: { page: number; limit: number; totalCount: number; totalPages: number }
}

const profile = ref<ProfileData | null>(null)

// Collapse state for summary section
const showSummary = ref(true)

// ─── Computed ──────────────────────────────────────────────────

const hcpName = computed(() => {
  if (!profile.value?.hcp) return '—'
  return `${profile.value.hcp.firstName} ${profile.value.hcp.lastName}`
})

/** Active (current valid) assessment, or null */
const activeAssessment = computed(() => {
  const assessments = profile.value?.assessments ?? []
  // First approved assessment that is still active
  return assessments.find(a => a.status === 'APPROVED' && a.isActive !== false) || null
})

// Summary stats
const totalAssessmentsCount = computed(() => profile.value?.pagination.totalCount ?? 0)
const approvedCount = computed(() => {
  if (!profile.value) return 0
  return profile.value.assessments.filter(a => a.status === 'APPROVED').length
})

const pendingCount = computed(() => {
  if (!profile.value) return 0
  const statuses = ['SUBMITTED', 'AI_PROCESSING', 'AI_COMPLETE', 'UNDER_REVIEW']
  return profile.value.assessments.filter(a => statuses.includes(a.status)).length
})

/** Current status text for the identity section */
const currentStatusText = computed(() => {
  if (!activeAssessment.value) return { label: 'No valid assessment', color: 'bg-slate-100 text-slate-800' }
  const renewalDate = activeAssessment.value.renewalDate
  if (!renewalDate) return { label: `Valid — ${activeAssessment.value.tierLabel || 'N/A'}`, color: 'bg-green-100 text-green-800' }

  const now = new Date()
  const renewal = new Date(renewalDate)
  const daysUntilExpiry = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return { label: `Expired ${Math.abs(daysUntilExpiry)}d ago`, color: 'bg-red-100 text-red-800' }
  } else if (daysUntilExpiry <= 30) {
    return { label: `${daysUntilExpiry} days left`, color: 'bg-red-100 text-red-800' }
  } else if (daysUntilExpiry <= 60) {
    return { label: `${daysUntilExpiry} days left`, color: 'bg-yellow-100 text-yellow-800' }
  } else {
    return { label: `Valid — ${activeAssessment.value.tierLabel || 'N/A'}`, color: 'bg-green-100 text-green-800' }
  }
})

// Summary stats

/** Expiry countdown for summary */
const expiryCountdown = computed(() => {
  if (!activeAssessment.value?.renewalDate) return null
  const now = new Date()
  const renewal = new Date(activeAssessment.value.renewalDate)
  const daysUntilExpiry = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) return `${Math.abs(daysUntilExpiry)}d overdue`
  if (daysUntilExpiry === 0) return 'Expires today'
  return `${daysUntilExpiry} days remaining`
})

/** Expiry urgency color for summary */
const expiryUrgencyColor = computed(() => {
  if (!activeAssessment.value?.renewalDate) return null
  const now = new Date()
  const renewal = new Date(activeAssessment.value.renewalDate)
  const daysUntilExpiry = Math.ceil((renewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) return 'bg-red-50 border-red-200 text-red-800'
  if (daysUntilExpiry <= 30) return 'bg-red-50 border-red-200 text-red-800'
  if (daysUntilExpiry <= 60) return 'bg-yellow-50 border-yellow-200 text-yellow-800'
  return 'bg-green-50 border-green-200 text-green-800'
})

// ─── Helpers ──────────────────────────────────────────────────

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    AI_PROCESSING: 'bg-yellow-100 text-yellow-800',
    AI_COMPLETE: 'bg-purple-100 text-purple-800',
    UNDER_REVIEW: 'bg-orange-100 text-orange-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800'
  }
  return colors[status] || 'bg-slate-100 text-slate-800'
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

// ─── Actions ──────────────────────────────────────────────────

async function fetchProfile() {
  loading.value = true
  profileError.value = ''
  try {
    const data = await assessmentDomain.fetchHcpProfile(hcpId.value, page.value, limit.value)
    profile.value = data
    totalPages.value = data.pagination.totalPages
    totalAssessments.value = data.pagination.totalCount
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : 'Failed to load HCP profile'
    console.error('HCP Profile fetch error:', error)
  } finally {
    loading.value = false
  }
}

function goToPage(p: number) {
  if (p >= 1 && p <= totalPages.value) {
    page.value = p
    fetchProfile()
  }
}

function navigateToAssessment(assessmentId: string) {
  const role = localStorage.getItem('userRole')
  if (role === 'ADMIN' || role === 'SA') {
    router.push(`/assessments/${assessmentId}/review`)
  } else {
    router.push(`/assessments/${assessmentId}`)
  }
}

// ─── Lifecycle ────────────────────────────────────────────────

onMounted(() => {
  fetchProfile()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header / Navigation -->
    <header class="bg-white shadow-sm border-b border-slate-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <button @click="router.back()" class="text-slate-400 hover:text-slate-600 transition-colors">
            <i class="pi pi-arrow-left w-5 h-5"></i>
          </button>
          <div>
            <h1 class="text-xl font-semibold text-slate-900">{{ hcpName }}</h1>
            <p v-if="profile?.hcp?.specialtyName" class="text-sm text-slate-500">
              {{ profile.hcp.specialtyName }} · {{ currentStatusText.label }}
            </p>
          </div>
        </div>
        <a
          href="/assessments/new?hcpId=HCP_ID_PLACEHOLDER"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium transition-colors"
        >
          + New Assessment
        </a>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Error State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-12 text-center">
        <svg class="mx-auto h-8 w-8 text-slate-400 animate-spin mb-3" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-sm text-slate-500">Loading HCP profile…</p>
      </div>

      <!-- Error Display -->
      <div v-else-if="profileError" class="bg-white shadow rounded-lg p-8 text-center">
        <i class="pi pi-times-circle mx-auto h-10 w-10 text-red-400 mb-3"></i>
        <p class="text-sm text-red-600 mb-3">{{ profileError }}</p>
        <button @click="fetchProfile" class="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium">
          Retry
        </button>
      </div>

      <!-- Profile Content -->
      <div v-else-if="profile" class="space-y-6">
        <!-- ─── Section 1: Identity Card ────────────────────── -->
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-base font-semibold text-slate-900">Identity</h2>
            <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', currentStatusText.color]">
              {{ currentStatusText.label }}
            </span>
          </div>

          <div class="px-6 py-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Name & Specialty -->
            <div>
              <h4 class="text-xs font-semibold text-slate-500 mb-2">Name</h4>
              <p class="text-lg font-semibold text-slate-900">{{ hcpName }}</p>
              <p v-if="profile.hcp.specialtyName" class="text-sm text-slate-500 mt-1">{{ profile.hcp.specialtyName }}</p>
            </div>

            <!-- Contact Info -->
            <div>
              <h4 class="text-xs font-semibold text-slate-500 mb-2">Contact</h4>
              <ul v-if="profile.hcp.email || profile.hcp.phone" class="space-y-1">
                <li v-if="profile.hcp.email" class="text-sm text-slate-900">{{ profile.hcp.email }}</li>
                <li v-if="profile.hcp.phone" class="text-sm text-slate-900">{{ profile.hcp.phone }}</li>
              </ul>
              <p v-if="!profile.hcp.email && !profile.hcp.phone" class="text-sm text-slate-400">—</p>
            </div>

            <!-- Address -->
            <div>
              <h4 class="text-xs font-semibold text-slate-500 mb-2">Location</h4>
              <p v-if="profile.hcp.city || profile.hcp.country" class="text-sm text-slate-900">
                {{ [profile.hcp.city, profile.hcp.state, profile.hcp.country].filter(Boolean).join(', ') }}
              </p>
              <p v-else class="text-sm text-slate-400">—</p>
            </div>

            <!-- External Identifiers -->
            <div class="md:col-span-3">
              <h4 class="text-xs font-semibold text-slate-500 mb-2">Identifiers</h4>
              <div v-if="profile.hcp.identifiers?.length" class="flex flex-wrap gap-2">
                <span v-for="id in profile.hcp.identifiers" :key="id.type + id.value"
                  class="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <span class="font-semibold mr-1">{{ id.type }}:</span> {{ id.value }}
                </span>
              </div>
              <p v-else class="text-sm text-slate-400">No identifiers on file</p>
            </div>

            <!-- Account Created -->
            <div class="md:col-span-3 border-t pt-4 mt-1">
              <h4 class="text-xs font-semibold text-slate-500 mb-2">Account</h4>
              <p class="text-sm text-slate-600">
                Created {{ formatDate(profile.hcp.createdAt) }} · Last updated {{ formatDate(profile.hcp.updatedAt) }}
              </p>
            </div>
          </div>
        </div>

        <!-- ─── Section 2: Summary Stats (Collapsible) ──────── -->
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <button
            @click="showSummary = !showSummary"
            class="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          >
            <h2 class="text-base font-semibold text-slate-900">Summary</h2>
            <i :class="['pi pi-chevron-down w-5 h-5 text-slate-400 transition-transform duration-200', showSummary ? 'rotate-180' : '']"></i>
          </button>

          <div v-show="showSummary" class="border-t border-slate-200 px-6 py-5">
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p class="text-xs font-semibold text-slate-500 mb-1">Total Assessments</p>
                <p class="text-2xl font-bold text-slate-900">{{ totalAssessmentsCount }}</p>
              </div>
              <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                <p class="text-xs font-semibold text-slate-500 mb-1">Approved</p>
                <p class="text-2xl font-bold text-slate-900">{{ approvedCount }}</p>
              </div>
              <div class="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <p class="text-xs font-semibold text-slate-500 mb-1">In Progress</p>
                <p class="text-2xl font-bold text-slate-900">{{ pendingCount }}</p>
              </div>
            </div>

            <!-- Active Assessment Details -->
            <div v-if="activeAssessment" :class="['rounded-lg border p-4', expiryUrgencyColor]">
              <h3 class="text-xs font-semibold text-slate-500 mb-3 opacity-75">Current Approval</h3>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p class="text-xs opacity-75">Score</p>
                  <p class="text-lg font-bold">{{ activeAssessment.totalScore ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-xs opacity-75">Tier</p>
                  <p class="text-lg font-bold">{{ activeAssessment.tierLabel || '—' }}</p>
                </div>
                <div>
                  <p class="text-xs opacity-75">Rate</p>
                  <p class="text-lg font-bold">${{ activeAssessment.rate?.toFixed(2) ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-xs opacity-75">Renewal</p>
                  <p class="text-lg font-bold">{{ expiryCountdown ?? '—' }}</p>
                  <p v-if="activeAssessment.renewalDate" class="text-xs mt-0.5 opacity-75">{{ formatDate(activeAssessment.renewalDate) }}</p>
                </div>
              </div>
            </div>

            <!-- No Active Assessment -->
            <div v-else-if="totalAssessmentsCount > 0" class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <h3 class="text-xs font-semibold text-slate-500 mb-1">No Active Approval</h3>
              <p class="text-sm text-yellow-800">All assessments for this HCP have been superseded or are pending review.</p>
            </div>

            <!-- Empty State -->
            <div v-if="totalAssessmentsCount === 0" class="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <i class="pi pi-user-minus mx-auto h-10 w-10 text-slate-400 mb-3"></i>
              <p class="text-sm text-slate-600">No assessments have been submitted for this HCP yet.</p>
            </div>
          </div>
        </div>

        <!-- ─── Section 3: Assessment Timeline Table ────────── -->
        <div class="bg-white shadow rounded-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-base font-semibold text-slate-900">Assessment History</h2>
            <p class="text-sm text-slate-500">{{ totalAssessmentsCount }} records</p>
          </div>

          <!-- Empty Timeline -->
          <div v-if="profile.assessments.length === 0" class="px-6 py-12 text-center">
            <i class="pi pi-history mx-auto h-8 w-8 text-slate-300 mb-2"></i>
            <p class="text-sm text-slate-500">No assessments in history.</p>
          </div>

          <!-- Timeline Table -->
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500">Date</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500">Status</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500">Score</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500">Tier</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500">Rate</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500">Renewal</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 hidden lg:table-cell">Criteria Set</th>
                  <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-slate-200">
                <tr v-for="assessment in profile.assessments" :key="assessment.id"
                  :class="[
                    'transition-colors',
                    assessment.isActive === false ? 'opacity-50' : '',
                    assessment.status === 'APPROVED' && !assessment.supersededAt ? 'bg-green-50/30' : ''
                  ]">

                  <!-- Active indicator row -->
                  <td class="px-6 py-4 whitespace-nowrap" :rowspan="1">
                    <div class="flex items-center space-x-2">
                      <i v-if="assessment.status === 'APPROVED' && !assessment.supersededAt" class="pi pi-check-circle w-4 h-4 text-green-500 flex-shrink-0"></i>
                      <span class="text-sm font-medium text-slate-900">{{ formatDate(assessment.completedAt || assessment.submittedAt || assessment.createdAt) }}</span>
                    </div>
                  </td>

                  <!-- Status -->
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(assessment.status)]">
                      {{ getStatusLabel(assessment.status) }}
                    </span>
                  </td>

                  <!-- Score -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right">
                    <template v-if="assessment.totalScore !== null">{{ assessment.totalScore }}</template>
                    <span v-else class="text-slate-400">—</span>
                  </td>

                  <!-- Tier -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {{ assessment.tierLabel || '—' }}
                  </td>

                  <!-- Rate -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-slate-900">
                    ${{ assessment.rate?.toFixed(2) ?? '—' }}
                  </td>

                  <!-- Renewal -->
                  <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <template v-if="assessment.renewalDate && assessment.status === 'APPROVED'">
                      {{ formatDate(assessment.renewalDate) }}
                    </template>
                    <span v-else class="text-slate-400">—</span>
                  </td>

                  <!-- Criteria Set Name (hidden on mobile) -->
                  <td class="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">
                    {{ assessment.criteriaSetName || '—' }}
                  </td>

                  <!-- Actions -->
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                    <button v-if="assessment.status === 'APPROVED'" @click="navigateToAssessment(assessment.id)" class="text-blue-600 hover:text-blue-900">View</button>
                    <button v-else-if="['AI_COMPLETE', 'REJECTED'].includes(assessment.status) && assessment.criteriaSnapshot"
                      @click="navigateToAssessment(assessment.id)"
                      class="text-purple-600 hover:text-purple-900">Review</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="bg-white px-4 py-3 border-t border-slate-200 flex items-center justify-between">
            <div class="text-sm text-slate-500">
              Showing {{ ((page - 1) * limit) + 1 }} to {{ Math.min(page * limit, totalAssessmentsCount) }} of {{ totalAssessmentsCount }} results
            </div>
            <div class="flex space-x-2">
              <button @click="goToPage(page - 1)" :disabled="page === 1"
                class="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors">Previous</button>
              <template v-for="p in Math.min(5, totalPages)" :key="p">
                <button @click="goToPage(p)" :class="[
                  'px-3 py-1 border rounded text-sm',
                  p === page ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-slate-50'
                ]">{{ p }}</button>
              </template>
              <button @click="goToPage(page + 1)" :disabled="page === totalPages"
                class="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50 transition-colors">Next</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* No custom styles needed — uses Tailwind classes throughout */
</style>
