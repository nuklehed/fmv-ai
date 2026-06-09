<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Specialty } from '@/types'
import { getAuthHeaders, apiFetch } from '@/composables/useCrud'

interface TierRate { id: string; specialtyId: string; criteriaSetId: string; tierLabel: string; lowRate: string; highRate: string; tenantId: string; createdAt: string; updatedAt: string }
interface CriteriaSet { id: string; name: string; tierThresholds?: any[] }

const specialties = ref<Specialty[]>([])
const criteriaSets = ref<CriteriaSet[]>([])
const rates = ref<TierRate[]>([])
const loading = ref(false)
const formError = ref('')
const selectedCriteriaSetId = ref<string>('')

// Modal state
const showEditModal = ref(false)
const editingRate = ref<TierRate | null>(null)
const editLowRate = ref(0)
const editHighRate = ref(0)
const editTierLabel = ref('')

// Editable cells (specialtyId → tierLabel → {lowRate, highRate})
const editableCells = computed(() => {
  const map = new Map<string, Record<string, { lowRate: string; highRate: string }>>()
  for (const rate of rates.value) {
    if (!map.has(rate.specialtyId)) map.set(rate.specialtyId, {})
    map.get(rate.specialtyId)![rate.tierLabel] = { lowRate: rate.lowRate, highRate: rate.highRate }
  }
  return map
})

// Tier labels from selected criteria set
const tierLabels = computed(() => {
  const cs = criteriaSets.value.find(c => c.id === selectedCriteriaSetId.value)
  if (cs?.tierThresholds) {
    return cs.tierThresholds.map((t: any) => t.label)
  }
  // Fallback to generic tier names
  const numTiers = 3
  return Array.from({ length: numTiers }, (_, i) => `Tier ${numTiers - i}`)
})

// Matrix data for rendering
const matrixData = computed(() => {
  const data: Array<{ id: string; name: string; [key: string]: any }> = []
  for (const specialty of specialties.value) {
    const row: any = { id: specialty.id, name: specialty.name }
    const ratesForSpecialty = editableCells.value.get(specialty.id) || {}
    for (const label of tierLabels.value) {
      const rateData = ratesForSpecialty[label]
      row[label] = rateData ? `${rateData.lowRate}–${rateData.highRate}` : null
    }
    data.push(row)
  }
  return data
})

async function fetchSpecialties() {
  try {
    specialties.value = await (await apiFetch('/api/specialties?active=true', { headers: getAuthHeaders() })).json()
  } catch { /* silent */ }
}

async function fetchCriteriaSets() {
  try {
    criteriaSets.value = await (await apiFetch('/api/criteria-sets?active=true', { headers: getAuthHeaders() })).json()
  } catch { /* silent */ }
}

async function fetchRates() {
  if (!selectedCriteriaSetId.value) return
  loading.value = true
  try {
    const result = await (await apiFetch(`/api/tiers?criteriaSetId=${selectedCriteriaSetId.value}`, { headers: getAuthHeaders() })).json()
    // Flatten the matrix data back to rates array for editing
    if (result.data && result.data.length > 0) {
      const labels = tierLabels.value
      const flattened: TierRate[] = []
      for (const row of result.data) {
        for (const label of labels) {
          if (row[label]) {
            // Parse the rate string to find the rate id
            const existing = rates.value.find(r => r.specialtyId === row.id && r.tierLabel === label)
            if (existing) {
              flattened.push(existing)
            }
          }
        }
      }
      rates.value = flattened
    }
  } catch {
    formError.value = 'Failed to load tier rates'
  } finally {
    loading.value = false
  }
}

async function openEditModal(rate: TierRate) {
  editingRate.value = rate
  editLowRate.value = Number(rate.lowRate)
  editHighRate.value = Number(rate.highRate)
  editTierLabel.value = rate.tierLabel
  showEditModal.value = true
}

async function handleEdit() {
  if (!editingRate.value || !editTierLabel.value) return
  if (editLowRate.value > editHighRate.value) { formError.value = 'Low rate must be ≤ high rate'; return }
  
  try {
    await apiFetch(`/api/tiers/${editingRate.value.id}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ tierLabel: editTierLabel.value, lowRate: editLowRate.value, highRate: editHighRate.value })
    })
    showEditModal.value = false
    editingRate.value = null
    await fetchRates()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to update rate'
  }
}

async function handleAdd(specialtyId: string) {
  if (!selectedCriteriaSetId.value) return
  
  for (const label of tierLabels.value) {
    const existing = rates.value.find(r => r.specialtyId === specialtyId && r.tierLabel === label)
    if (!existing) {
      try {
        await apiFetch('/api/tiers', {
          method: 'POST', headers: getAuthHeaders(),
          body: JSON.stringify({
            specialtyId,
            criteriaSetId: selectedCriteriaSetId.value,
            tierLabel: label,
            lowRate: 50,
            highRate: 245
          })
        })
      } catch { /* silent — will show on refresh */ }
    }
  }
  
  await fetchRates()
}

function handleDelete(rate: TierRate) {
  if (!confirm(`Delete rate for ${rate.tierLabel}?`)) return
  apiFetch(`/api/tiers/${rate.id}`, { method: 'DELETE', headers: getAuthHeaders() })
    .then(() => fetchRates())
    .catch(() => formError.value = 'Failed to delete rate')
}

onMounted(async () => {
  await Promise.all([fetchSpecialties(), fetchCriteriaSets()])
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Tier Rates</h2>
          <p class="text-sm text-gray-600">Configure rate ranges per specialty and tier</p>
        </div>
      </div>

      <!-- Criteria Set Selector -->
      <div class="mb-6 flex items-center gap-4">
        <label class="text-sm font-medium text-gray-700">Criteria Set:</label>
        <select v-model="selectedCriteriaSetId" @change="fetchRates" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]">
          <option value="">— Select —</option>
          <option v-for="cs in criteriaSets" :key="cs.id" :value="cs.id">{{ cs.name }}</option>
        </select>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showEditModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading tier rates...</p>
      </div>

      <!-- Matrix Table -->
      <div v-else-if="selectedCriteriaSetId && matrixData.length > 0" class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">Specialty</th>
              <th v-for="label in tierLabels" :key="label" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                {{ label }} Rate
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="row in matrixData" :key="row.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">{{ row.name }}</td>
              <td v-for="label in tierLabels" :key="label" class="px-6 py-4 text-center">
                <template v-if="row[label]">
                  <span class="text-sm text-gray-900">${{ row[label].split('–')[0] }}–${{ row[label].split('–')[1] }}</span>
                </template>
                <template v-else>
                  <span class="text-xs text-gray-400 italic">Not set</span>
                </template>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <button v-for="label in tierLabels" :key="label" @click="openEditModal(rates.find(r => r.specialtyId === row.id && r.tierLabel === label) || rates[0] as any)" class="text-blue-600 hover:text-blue-900 text-xs">
                  Edit
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Add Rates Button -->
        <div class="bg-gray-50 px-4 py-3 border-t border-gray-200">
          <button @click="handleAdd(matrixData[0]?.id)" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            + Add Missing Rates
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Select a criteria set to configure tier rates</p>
      </div>

      <!-- ─── Edit Rate Modal ─────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Rate</h3>
                  <form @submit.prevent="handleEdit" class="space-y-4">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Tier Label *</label><input v-model="editTierLabel" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>

                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Low Rate ($) *</label><input v-model.number="editLowRate" type="number" step="5" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">High Rate ($) *</label><input v-model.number="editHighRate" type="number" step="5" required min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>

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
