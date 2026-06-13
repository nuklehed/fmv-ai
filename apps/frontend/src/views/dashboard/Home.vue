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

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchAssessments(), 300)
}


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
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Dashboard Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-slate-900 mb-1">Dashboard</h2>
          <p class="text-sm text-slate-600">{{ totalCount }} active approvals (one per HCP)</p>
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
          <p class="text-sm text-slate-500">Active Approvals</p>
          <p class="text-2xl font-bold text-slate-900">{{ totalCount }}</p>
        </div>
        <div class="bg-white shadow rounded-lg p-4 border-l-4 border-red-500">
          <p class="text-sm text-slate-500">Expiring Soon</p>
          <p class="text-2xl font-bold text-slate-900">{{ assessments.filter(a => { const u = getExpiryUrgency(a.renewalDate); return u && (u.label.includes('days left') || u.label.includes('Expired')) }).length }}</p>
        </div>
        <a href="/assessments" class="bg-white shadow rounded-lg p-4 border-l-4 border-blue-500 hover:bg-slate-50 cursor-pointer flex items-center">
          <div>
            <p class="text-sm text-slate-500">All Requests</p>
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
          class="flex-1 max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
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
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Score</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Tier</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Rate</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500">Renewal</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <tr v-if="assessments.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-sm text-slate-500">
                No active approvals found. Click "Request Assessment" to create one.
              </td>
            </tr>
            <tr v-for="assessment in assessments" :key="assessment.id" class="hover:bg-slate-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-slate-900">{{ (assessment as any).hcp?.firstName || '—' }} {{ (assessment as any).hcp?.lastName || '—' }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                {{ assessment.totalScore !== null ? assessment.totalScore : '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                {{ (assessment as any).tierLabel || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                ${{ (assessment.rate != null ? Number(assessment.rate) : null)?.toFixed(2) || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span v-if="assessment.renewalDate" :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getExpiryUrgency(assessment.renewalDate)?.color || 'bg-slate-100 text-slate-800']">
                  {{ getExpiryUrgency(assessment.renewalDate)?.label }}
                </span>
                <span v-else class="text-xs text-slate-400">—</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <button @click.stop="viewHcpProfile(assessment)" class="text-purple-600 hover:text-purple-900 text-sm font-medium">Profile</button>
              </td>
            </tr>
          </tbody>
        </table>

      </div>


    </main>
  </div>
</template>

<style scoped>
/* Dashboard is intentionally minimal — no slideover panel styles needed */
</style>
