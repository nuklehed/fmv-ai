<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Tier, CriteriaSet } from '@/types'
import { getAuthHeaders, apiFetch } from '@/composables/useCrud'

const tiers = ref<Tier[]>([])
const criteriaSets = ref<CriteriaSet[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = ref(0)
const totalCount = ref(0)
const formError = ref('')

const showAddModal = ref(false)
const showEditModal = ref(false)
const editingTier = ref<Tier | null>(null)

const formName = ref('')
const formMinScore = ref(0)
const formMaxScore = ref(0)
const formCriteriaSetId = ref('')
const formLowRate = ref(0)
const formHighRate = ref(0)
const formDefaultPercentile = ref(50)

async function fetchTiers() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(currentPage.value), limit: String(pageSize.value) })
    const result = await (await apiFetch(`/api/tiers?${params}`, { headers: getAuthHeaders() })).json()
    tiers.value = result.data
    totalPages.value = result.pagination.totalPages
    totalCount.value = result.pagination.totalCount
  } catch {
    formError.value = 'Failed to load tiers'
  } finally {
    loading.value = false
  }
}

async function fetchCriteriaSets() {
  try {
    criteriaSets.value = await (await apiFetch('/api/criteria-sets?active=true', { headers: getAuthHeaders() })).json()
  } catch { /* silent */ }
}

function openAddModal() { resetForm(); showAddModal.value = true }

function openEditModal(tier: Tier) {
  editingTier.value = tier
  formName.value = tier.name; formMinScore.value = tier.minScore; formMaxScore.value = tier.maxScore
  formCriteriaSetId.value = tier.criteriaSetId; formLowRate.value = Number(tier.lowRate)
  formHighRate.value = Number(tier.highRate); formDefaultPercentile.value = tier.defaultPercentile
  showEditModal.value = true
}

function resetForm() {
  editingTier.value = null; formName.value = ''; formMinScore.value = 0; formMaxScore.value = 0
  formCriteriaSetId.value = ''; formLowRate.value = 0; formHighRate.value = 0; formDefaultPercentile.value = 50
  formError.value = ''
}

function validateTier() {
  if (!formName.value.trim()) { formError.value = 'Tier name is required'; return false }
  if (formMinScore.value > formMaxScore.value) { formError.value = 'Min score must be ≤ max score'; return false }
  if (formLowRate.value > formHighRate.value) { formError.value = 'Low rate must be ≤ high rate'; return false }
  return true
}

async function handleAdd() {
  if (!validateTier()) return
  try {
    await apiFetch('/api/tiers', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, minScore: formMinScore.value, maxScore: formMaxScore.value,
        criteriaSetId: formCriteriaSetId.value, lowRate: formLowRate.value, highRate: formHighRate.value,
        defaultPercentile: formDefaultPercentile.value })
    })
    showAddModal.value = false; resetForm(); await fetchTiers()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to create tier' }
}

async function handleEdit() {
  if (!editingTier.value || !validateTier()) return
  try {
    await apiFetch(`/api/tiers/${editingTier.value.id}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, minScore: formMinScore.value, maxScore: formMaxScore.value,
        criteriaSetId: formCriteriaSetId.value, lowRate: formLowRate.value, highRate: formHighRate.value,
        defaultPercentile: formDefaultPercentile.value })
    })
    showEditModal.value = false; resetForm(); await fetchTiers()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to update tier' }
}

async function handleDelete(tier: Tier) {
  if (!confirm(`Are you sure you want to delete "${tier.name}"?`)) return
  try {
    await apiFetch(`/api/tiers/${tier.id}`, { method: 'DELETE', headers: getAuthHeaders() })
    await fetchTiers()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to delete tier' }
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) { currentPage.value = page; fetchTiers() }
}

onMounted(() => { fetchTiers(); fetchCriteriaSets() })
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Tier Management</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} tiers configured</p>
        </div>
        <button
          @click="openAddModal"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          + Add Tier
        </button>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showAddModal && !showEditModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading tiers...</p>
      </div>

      <!-- Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Specialty</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score Range</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate Range</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentile</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="tiers.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
                No tiers found. Click "Add Tier" to create one.
              </td>
            </tr>
            <tr v-for="tier in tiers" :key="tier.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ tier.name }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ tier.criteriaSet?.name || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ tier.minScore }} – {{ tier.maxScore }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${{ Number(tier.lowRate).toFixed(2) }} – ${{ Number(tier.highRate).toFixed(2) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ tier.defaultPercentile }}%</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <button @click="openEditModal(tier)" class="text-blue-600 hover:text-blue-900">Edit</button>
                <span>|</span>
                <button @click="handleDelete(tier)" class="text-red-600 hover:text-red-900">Delete</button>
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

      <!-- ─── Add Tier Modal ──────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add New Tier</h3>
                  <form @submit.prevent="handleAdd" class="space-y-4">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Tier Name *</label><input v-model="formName" type="text" required placeholder="e.g., Tier 1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Criteria Set *</label>
                      <select v-model="formCriteriaSetId" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select criteria set...</option>
                        <option v-for="c in criteriaSets" :key="c.id" :value="c.id">{{ c.name }}</option>
                      </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Min Score *</label><input v-model.number="formMinScore" type="number" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Max Score *</label><input v-model.number="formMaxScore" type="number" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Low Rate ($) *</label><input v-model.number="formLowRate" type="number" step="0.01" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">High Rate ($) *</label><input v-model.number="formHighRate" type="number" step="0.01" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>

                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Default Percentile (0–100)</label><input v-model.number="formDefaultPercentile" type="number" min="0" max="100" value="50" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>

                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleAdd" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Create</button>
                  <button @click="showAddModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ─── Edit Tier Modal ─────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Tier</h3>
                  <form @submit.prevent="handleEdit" class="space-y-4">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Tier Name *</label><input v-model="formName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Criteria Set *</label>
                      <select v-model="formCriteriaSetId" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select criteria set...</option>
                        <option v-for="c in criteriaSets" :key="c.id" :value="c.id">{{ c.name }}</option>
                      </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Min Score *</label><input v-model.number="formMinScore" type="number" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Max Score *</label><input v-model.number="formMaxScore" type="number" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Low Rate ($) *</label><input v-model.number="formLowRate" type="number" step="0.01" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">High Rate ($) *</label><input v-model.number="formHighRate" type="number" step="0.01" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>

                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Default Percentile (0–100)</label><input v-model.number="formDefaultPercentile" type="number" min="0" max="100" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>

                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleEdit" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Save</button>
                  <button @click="showEditModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </main>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
