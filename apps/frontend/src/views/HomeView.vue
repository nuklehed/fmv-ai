<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Hcp } from '@/types'

const hcps = ref<Hcp[]>([])
const loading = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = ref(0)
const totalCount = ref(0)
const formError = ref('')

// Sort state
const sortField = ref('lastName')
const sortOrder = ref<'asc' | 'desc'>('asc')

// Detail/Edit panel state
const selectedHcp = ref<Hcp | null>(null)
const showDetailPanel = ref(false)
const isEditing = ref(false)
const editingHcp = ref<Partial<Hcp>>({})
const showAddModal = ref(false)

// Add form state
const addFirstName = ref('')
const addLastName = ref('')
const addEmail = ref('')
const addPhone = ref('')
const addAddress = ref('')
const addState = ref('')
const addSpecialtyId = ref('')
const addIdentifiers = ref<{ type: string; value: string }[]>([])

// Edit form state
const editFirstName = ref('')
const editLastName = ref('')
const editEmail = ref('')
const editPhone = ref('')
const editAddress = ref('')
const editState = ref('')
const editSpecialtyId = ref('')
const editIdentifiers = ref<{ type: string; value: string }[]>([])

// Specialty list for dropdowns (loaded once)
const specialties = ref<{ id: string; name: string }[]>([])

async function fetchHcps() {
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams({
      page: String(currentPage.value),
      limit: String(pageSize.value),
      sort: sortField.value,
      order: sortOrder.value,
      search: searchQuery.value || ''
    })

    const response = await fetch(`/api/hcps?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to fetch HCPs: ${response.statusText}`)

    const result = await response.json()
    hcps.value = result.data
    totalPages.value = result.pagination.totalPages
    totalCount.value = result.pagination.totalCount
  } catch (error) {
    console.error('Error fetching HCPs:', error)
    formError.value = 'Failed to load HCPs'
  } finally {
    loading.value = false
  }
}

async function fetchSpecialties() {
  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/specialties?active=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) {
      specialties.value = await response.json()
    }
  } catch (error) {
    console.error('Error fetching specialties:', error)
  }
}

function handleSort(field: string) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
  currentPage.value = 1
}

function handleSearch() {
  currentPage.value = 1
  fetchHcps()
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => handleSearch(), 300)
}

async function openDetailPanel(hcp: Hcp) {
  selectedHcp.value = hcp
  showDetailPanel.value = true
  isEditing.value = false
}

function closeDetailPanel() {
  showDetailPanel.value = false
  selectedHcp.value = null
  isEditing.value = false
}

async function openEditPanel(hcp: Hcp) {
  editingHcp.value = { ...hcp }
  editFirstName.value = hcp.firstName
  editLastName.value = hcp.lastName
  editEmail.value = hcp.email || ''
  editPhone.value = hcp.phone || ''
  editAddress.value = hcp.address || ''
  editState.value = hcp.state || ''
  editSpecialtyId.value = hcp.specialtyId || ''
  editIdentifiers.value = [] // Will be populated from HCP detail API call
  isEditing.value = true
}

async function handleSaveEdit() {
  if (!selectedHcp.value) return

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/hcps/${selectedHcp.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstName: editFirstName.value,
        lastName: editLastName.value,
        email: editEmail.value || null,
        phone: editPhone.value || null,
        address: editAddress.value || null,
        state: editState.value || null,
        specialtyId: editSpecialtyId.value || null
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update HCP')
    }

    isEditing.value = false
    await fetchHcps()
  } catch (error) {
    console.error('Error updating HCP:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to update HCP'
  }
}

function openAddModal() {
  addFirstName.value = ''
  addLastName.value = ''
  addEmail.value = ''
  addPhone.value = ''
  addAddress.value = ''
  addState.value = ''
  addSpecialtyId.value = ''
  addIdentifiers.value = []
  formError.value = ''
  showAddModal.value = true
}

async function handleAdd() {
  if (!addFirstName.value.trim() || !addLastName.value.trim()) {
    formError.value = 'First name and last name are required'
    return
  }

  try {
    const token = localStorage.getItem('token')
    const response = await fetch('/api/hcps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstName: addFirstName.value,
        lastName: addLastName.value,
        email: addEmail.value || null,
        phone: addPhone.value || null,
        address: addAddress.value || null,
        state: addState.value || null,
        specialtyId: addSpecialtyId.value || null,
        identifiers: addIdentifiers.value.length > 0 ? addIdentifiers.value : undefined
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create HCP')
    }

    showAddModal.value = false
    formError.value = ''
    await fetchHcps()
  } catch (error) {
    console.error('Error creating HCP:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to create HCP'
  }
}

function getStatusColor(status?: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    AI_PROCESSING: 'bg-yellow-100 text-yellow-800',
    AI_COMPLETE: 'bg-purple-100 text-purple-800',
    UNDER_REVIEW: 'bg-orange-100 text-orange-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800'
  }
  return colors[status || ''] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    AI_PROCESSING: 'AI Processing',
    AI_COMPLETE: 'AI Complete',
    UNDER_REVIEW: 'Under Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
  }
  return labels[status || ''] || status || '—'
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

// Pagination helpers
function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    fetchHcps()
  }
}

onMounted(() => {
  fetchHcps()
  fetchSpecialties()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white shadow-sm border-b border-gray-200">
      <div class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-900">FMV AI Platform</h1>
        <nav class="flex space-x-4">
          <a href="/" class="text-sm font-medium text-blue-600">Dashboard</a>
          <a href="/specialties" class="text-sm text-gray-600 hover:text-gray-900">Specialties</a>
          <a href="/criteria-sets" class="text-sm text-gray-600 hover:text-gray-900">Criteria Sets</a>
          <a href="#" class="text-sm text-gray-600 hover:text-gray-900">Settings</a>
        </nav>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">HCP Directory</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} healthcare professionals</p>
        </div>
        <button
          @click="openAddModal"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          + Add HCP
        </button>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showAddModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Search Bar -->
      <div class="mb-6 flex items-center space-x-4">
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="Search by name, NPI, email, or state..."
          class="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <select
          v-model="pageSize"
          @change="currentPage = 1; fetchHcps()"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option :value="10">10 per page</option>
          <option :value="25">25 per page</option>
          <option :value="50">50 per page</option>
        </select>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading HCPs...</p>
      </div>

      <!-- Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th @click="handleSort('lastName')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                Name {{ sortField === 'lastName' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identifier</th>
              <th @click="handleSort('state')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                State {{ sortField === 'state' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
              </th>
              <th @click="handleSort('specialtyName')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                Specialty {{ sortField === 'specialtyName' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
              <th @click="handleSort('createdAt')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">
                Status {{ sortField === 'createdAt' ? (sortOrder === 'asc' ? '↑' : '↓') : '' }}
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Effective</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renewal</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="hcps.length === 0">
              <td colspan="10" class="px-6 py-8 text-center text-sm text-gray-500">
                No HCPs found. Click "Add HCP" to create one.
              </td>
            </tr>
            <tr v-for="hcp in hcps" :key="hcp.id" class="hover:bg-gray-50 cursor-pointer" @click="openDetailPanel(hcp)">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">{{ hcp.firstName }} {{ hcp.lastName }}</div>
                <div v-if="hcp.email" class="text-xs text-gray-500">{{ hcp.email }}</div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ hcp.identifiers?.[0]?.value || '—' }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ hcp.state || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ hcp.specialtyName || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ hcp.tier ? `Tier ${hcp.tier}` : '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${{ hcp.rate?.toFixed(2) || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', getStatusColor(hcp.status)]">
                  {{ getStatusLabel(hcp.status) }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(hcp.effectiveDate) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(hcp.renewalDate) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2" @click.stop>
                <button @click="openEditPanel(hcp)" class="text-blue-600 hover:text-blue-900">Edit</button>
                <span>|</span>
                <button @click="handleSort('lastName')" class="text-red-600 hover:text-red-900">Deactivate</button>
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

      <!-- ─── Detail/Edit Slide-over Panel ────────────────────────── -->
      <Teleport to="body">
        <Transition name="slideover">
          <div v-if="showDetailPanel" class="fixed inset-0 z-50 overflow-hidden">
            <div class="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" @click="closeDetailPanel" />

            <div class="fixed inset-y-0 right-0 max-w-md w-full flex">
              <Transition name="slideover-panel">
                <div v-if="showDetailPanel" class="w-full h-full flex flex-col bg-white shadow-xl">
                  <!-- Panel Header -->
                  <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h3 class="text-lg font-semibold text-gray-900">
                      {{ isEditing ? 'Edit HCP' : selectedHcp?.firstName + ' ' + selectedHcp?.lastName }}
                    </h3>
                    <button @click="closeDetailPanel" class="text-gray-400 hover:text-gray-600">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <!-- Panel Content -->
                  <div class="flex-1 overflow-y-auto p-6">
                    <template v-if="!isEditing">
                      <!-- Detail View -->
                      <dl class="space-y-4">
                        <div><dt class="text-sm font-medium text-gray-500">First Name</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.firstName }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">Last Name</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.lastName }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">Email</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.email || '—' }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">Phone</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.phone || '—' }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">Address</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.address || '—' }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">State</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.state || '—' }}</dd></div>
                        <div><dt class="text-sm font-medium text-gray-500">Specialty</dt><dd class="mt-1 text-sm text-gray-900">{{ selectedHcp?.specialtyName || '—' }}</dd></div>
                      </dl>

                      <!-- Actions -->
                      <div class="mt-6 flex space-x-3">
                        <button @click="openEditPanel(selectedHcp!)" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Edit</button>
                      </div>
                    </template>

                    <template v-else>
                      <!-- Edit Form -->
                      <form @submit.prevent="handleSaveEdit" class="space-y-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label><input v-model="editFirstName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label><input v-model="editLastName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input v-model="editEmail" type="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Phone</label><input v-model="editPhone" type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Address</label><input v-model="editAddress" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">State</label><input v-model="editState" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">Specialty</label><select v-model="editSpecialtyId" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="">Select specialty...</option><option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
                        <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>

                        <div class="flex space-x-3 pt-4">
                          <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Save</button>
                          <button type="button" @click="isEditing = false" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                        </div>
                      </form>
                    </template>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ─── Add HCP Modal ──────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add New HCP</h3>
                  <form @submit.prevent="handleAdd" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">First Name *</label><input v-model="addFirstName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                      <div><label class="block text-sm font-medium text-gray-700 mb-1">Last Name *</label><input v-model="addLastName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    </div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label><input v-model="addEmail" type="email" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Phone</label><input v-model="addPhone" type="tel" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Address</label><input v-model="addAddress" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">State</label><input v-model="addState" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Specialty</label><select v-model="addSpecialtyId" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="">Select specialty...</option><option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
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
    </main>
  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }

.slideover-enter-active, .slideover-leave-active { transition: opacity 0.3s ease; }
.slideover-enter-from, .slideover-leave-to { opacity: 0; }

.slideover-panel-enter-active, .slideover-panel-leave-active { transition: transform 0.3s ease; }
.slideover-panel-enter-from, .slideover-panel-leave-to { transform: translateX(100%); }
</style>
