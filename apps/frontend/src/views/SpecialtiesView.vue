<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Specialty } from '@/types'
import { getAuthHeaders, apiFetch } from '@/composables/useCrud'

const specialties = ref<Specialty[]>([])
const loading = ref(false)
const searchQuery = ref('')
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingSpecialty = ref<Specialty | null>(null)

// Form state for add/edit
const formName = ref('')
const formDescription = ref('')
const formError = ref('')

function resetForm() {
  formName.value = ''
  formDescription.value = ''
  formError.value = ''
}

async function fetchSpecialties() {
  loading.value = true
  try {
    const response = await apiFetch(
      `/api/specialties?active=true&search=${encodeURIComponent(searchQuery.value)}`,
      { headers: getAuthHeaders() }
    )
    specialties.value = await response.json()
  } catch (error) {
    formError.value = 'Failed to load specialties'
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  if (!formName.value.trim()) {
    formError.value = 'Specialty name is required'
    return
  }
  try {
    await apiFetch('/api/specialties', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, description: formDescription.value || null })
    })
    showAddModal.value = false
    resetForm()
    await fetchSpecialties()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to create specialty'
  }
}

async function openEditModal(specialty: Specialty) {
  editingSpecialty.value = specialty
  formName.value = specialty.name
  formDescription.value = specialty.description || ''
  formError.value = ''
  showEditModal.value = true
}

async function handleUpdate() {
  if (!editingSpecialty.value || !formName.value.trim()) {
    formError.value = 'Specialty name is required'
    return
  }
  try {
    await apiFetch(`/api/specialties/${editingSpecialty.value.id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, description: formDescription.value || null })
    })
    showEditModal.value = false
    resetForm()
    editingSpecialty.value = null
    await fetchSpecialties()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to update specialty'
  }
}

async function handleDeactivate(id: string, name: string) {
  if (!confirm(`Are you sure you want to deactivate "${name}"?`)) return
  try {
    await apiFetch(`/api/specialties/${id}`, { method: 'DELETE', headers: getAuthHeaders() })
    await fetchSpecialties()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to deactivate specialty'
  }
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchSpecialties(), 300)
}

onMounted(fetchSpecialties)
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Specialties Management</h2>
          <p class="text-sm text-gray-600">Manage HCP practice categories (Superadmin only)</p>
        </div>
        <button
          @click="showAddModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          Add Specialty
        </button>
      </div>

      <!-- Search Bar -->
      <div class="mb-6">
        <input
          v-model="searchQuery"
          @input="handleSearch"
          type="text"
          placeholder="Search by name or description..."
          class="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading specialties...</p>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showAddModal && !showEditModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Table -->
      <div v-if="!loading" class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="specialties.length === 0">
              <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
                No specialties found. Click "Add Specialty" to create one.
              </td>
            </tr>
            <tr v-for="specialty in specialties" :key="specialty.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ specialty.name }}</td>
              <td class="px-6 py-4 text-sm text-gray-500">{{ specialty.description || '—' }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span
                  :class="[
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    specialty.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  ]"
                >
                  {{ specialty.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {{ new Date(specialty.updatedAt).toLocaleDateString() }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button
                  @click="openEditModal(specialty)"
                  class="text-blue-600 hover:text-blue-900"
                >
                  Edit
                </button>
                <span v-if="specialty.isActive">|</span>
                <button
                  v-if="specialty.isActive"
                  @click="handleDeactivate(specialty.id, specialty.name)"
                  class="text-red-600 hover:text-red-900"
                >
                  Deactivate
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <!-- Background overlay -->
              <div
                class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                @click="showAddModal = false"
              />

              <!-- Modal panel -->
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add New Specialty</h3>

                  <form @submit.prevent="handleAdd" class="space-y-4">
                    <div>
                      <label for="add-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        id="add-name"
                        v-model="formName"
                        type="text"
                        required
                        placeholder="e.g., Cardiology"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label for="add-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        id="add-description"
                        v-model="formDescription"
                        rows="3"
                        placeholder="Optional description..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>

                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    @click="handleAdd"
                    type="button"
                    class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Create
                  </button>
                  <button
                    @click="showAddModal = false"
                    type="button"
                    class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Edit Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <!-- Background overlay -->
              <div
                class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
                @click="showEditModal = false"
              />

              <!-- Modal panel -->
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Specialty</h3>

                  <form @submit.prevent="handleUpdate" class="space-y-4">
                    <div>
                      <label for="edit-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        id="edit-name"
                        v-model="formName"
                        type="text"
                        required
                        placeholder="e.g., Cardiology"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label for="edit-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        id="edit-description"
                        v-model="formDescription"
                        rows="3"
                        placeholder="Optional description..."
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>

                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    @click="handleUpdate"
                    type="button"
                    class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Save Changes
                  </button>
                  <button
                    @click="showEditModal = false"
                    type="button"
                    class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancel
                  </button>
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
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
