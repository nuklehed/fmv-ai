<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Specialty } from '@/types'
import { getAuthHeaders, apiFetch } from '@/composables/useCrud'

interface TierRate { id: string; specialtyId: string; criteriaSetId: string; tierLabel: string; lowRate: string; highRate: string; tenantId: string; createdAt: string; updatedAt: string }
interface CriteriaSet { id: string; name: string; tierThresholds?: any[] }

const specialties = ref<Specialty[]>([])
const criteriaSets = ref<CriteriaSet[]>([])
const rates = ref<TierRate[]>([])

// Specialties assigned to the selected criteria set
const tableSpecialties = computed(() => {
  if (!selectedCriteriaSetId.value) return []
  return specialties.value.filter(s => s.criteriaSetId === selectedCriteriaSetId.value).sort((a, b) => a.name.localeCompare(b.name))
})

function hasRates(specialtyId: string): boolean {
  return rates.value.some(r => r.specialtyId === specialtyId)
}
const loading = ref(false)
const formError = ref('')
const selectedCriteriaSetId = ref<string>('')

// Modal state
const showEditModal = ref(false)
const editingSpecialty = ref<{ id: string; name: string } | null>(null)
const edits = ref<Record<string, { lowRate: number; highRate: number }>>({})

// Rates keyed by specialtyId → tierLabel → rate object
const ratesMap = computed(() => {
  const map = new Map<string, Record<string, TierRate>>()
  for (const r of rates.value) {
    if (!map.has(r.specialtyId)) map.set(r.specialtyId, {})
    map.get(r.specialtyId)![r.tierLabel] = r
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
    // Fetch flat rates list for this criteria set
    const result = await (await apiFetch(
      `/api/tiers/specialties/_all/criteria-sets/${selectedCriteriaSetId.value}/rates`,
      { headers: getAuthHeaders() }
    )).json()
    rates.value = result.data || []
  } catch {
    formError.value = 'Failed to load tier rates'
  } finally {
    loading.value = false
  }
}

async function openEditModal(specialty: Specialty) {
  const specialtyRates = ratesMap.value.get(specialty.id) || {}
  edits.value = {}
  for (const label of tierLabels.value) {
    const rate = specialtyRates[label]
    edits.value[label] = rate
      ? { lowRate: Number(rate.lowRate), highRate: Number(rate.highRate) }
      : { lowRate: 0, highRate: 0 }
  }
  editingSpecialty.value = { id: specialty.id, name: specialty.name }
  showEditModal.value = true
}

async function handleSave() {
  if (!editingSpecialty.value) return
  const specId = editingSpecialty.value.id
  const criteriaSetId = selectedCriteriaSetId.value

  const promises = tierLabels.value.map(async (label) => {
    const edit = edits.value[label]
    if (!edit) return
    if (edit.lowRate > edit.highRate) { formError.value = `Low rate must be ≤ high rate`; return }

    const existing = rates.value.find(r => r.specialtyId === specId && r.tierLabel === label)
    if (existing) {
      await apiFetch(`/api/tiers/${existing.id}`, {
        method: 'PUT', headers: getAuthHeaders(),
        body: JSON.stringify({ lowRate: edit.lowRate, highRate: edit.highRate })
      })
    } else {
      await apiFetch('/api/tiers', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({
          specialtyId: specId,
          criteriaSetId: criteriaSetId,
          tierLabel: label,
          lowRate: edit.lowRate,
          highRate: edit.highRate
        })
      })
    }
  })

  await Promise.all(promises)
  showEditModal.value = false
  editingSpecialty.value = null
  await fetchRates()
}

function formatRate(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return isNaN(num) ? '—' : `$${num.toLocaleString()}`
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
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Tier Rates Management</h2>
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
      <div v-else-if="selectedCriteriaSetId && tableSpecialties.length > 0" class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <!-- Tier label row (merged over Min/Max) -->
            <tr>
              <th></th>
              <template v-for="label in tierLabels" :key="label">
                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" colspan="2">{{ label }}</th>
              </template>
              <th></th>
            </tr>
            <!-- Min / Max sub-row -->
            <tr>
              <th class="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10" rowspan="2">Specialty</th>
              <template v-for="label in tierLabels" :key="label">
                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Min</th>
                <th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Max</th>
              </template>
              <th class="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" rowspan="2">Action</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-for="specialty in tableSpecialties" :key="specialty.id" :class="{ 'bg-yellow-50': !hasRates(specialty.id) }">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">{{ specialty.name }}</td>

              <template v-for="label in tierLabels" :key="label">
                <td class="px-4 py-4 text-center text-sm text-gray-700">
                  {{ formatRate(ratesMap.get(specialty.id)?.[label]?.lowRate ?? '—') }}
                </td>
                <td class="px-4 py-4 text-center text-sm text-gray-700">
                  {{ formatRate(ratesMap.get(specialty.id)?.[label]?.highRate ?? '—') }}
                </td>
              </template>

              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button @click="openEditModal(specialty)" :class="hasRates(specialty.id) ? 'text-blue-600 hover:text-blue-900' : 'text-emerald-600 hover:text-emerald-900'">
                  {{ hasRates(specialty.id) ? 'Edit' : 'Add' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
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
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-1">Edit Rates</h3>
                  <p v-if="editingSpecialty" class="text-sm text-gray-600">{{ editingSpecialty.name }}</p>

                  <form @submit.prevent="handleSave" class="mt-4 space-y-3">
                    <table class="min-w-full divide-y divide-gray-200">
                      <thead class="bg-gray-50">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                          <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Min Rate ($)</th>
                          <th class="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Max Rate ($)</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white divide-y divide-gray-200">
                        <tr v-for="label in tierLabels" :key="label">
                          <td class="px-3 py-2 text-sm font-medium text-gray-900">{{ label }}</td>
                          <td class="px-3 py-2">
                            <input v-model.number="edits[label].lowRate" type="number" step="5" min="0" required
                              class="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-blue-500" />
                          </td>
                          <td class="px-3 py-2">
                            <input v-model.number="edits[label].highRate" type="number" step="5" min="0" required
                              class="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-blue-500" />
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleSave" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Save All</button>
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
