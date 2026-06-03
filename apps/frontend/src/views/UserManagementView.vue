<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface UserListItem {
  id: string
  email: string
  role: 'BU' | 'ADMIN' | 'SA'
  tenantId: string
  isActive: boolean
  emailVerified: boolean
  createdAt: string
  updatedAt: string
}

const users = ref<UserListItem[]>([])
const loading = ref(false)
const searchQuery = ref('')
const currentPage = ref(1)
const pageSize = ref(25)
const totalPages = ref(0)
const totalCount = ref(0)
const formError = ref('')

// Modal states
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingUser = ref<UserListItem | null>(null)

// Add form state
const addEmail = ref('')
const addPassword = ref('')
const addRole = ref<'BU' | 'ADMIN'>('BU')
const addEmailVerified = ref(false)

// Edit form state
const editEmail = ref('')
const editPassword = ref('')
const editRole = ref<'BU' | 'ADMIN' | 'SA'>('BU')
const editIsActive = ref(true)
const editEmailVerified = ref(false)

async function fetchUsers() {
  loading.value = true
  try {
    const token = localStorage.getItem('accessToken')
    const params = new URLSearchParams({
      page: String(currentPage.value),
      limit: String(pageSize.value),
      search: searchQuery.value || ''
    })

    const response = await fetch(`/api/users?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to fetch users: ${response.statusText}`)

    const result = await response.json()
    users.value = result.data
    totalPages.value = result.pagination.totalPages
    totalCount.value = result.pagination.totalCount
  } catch (error) {
    console.error('Error fetching users:', error)
    formError.value = 'Failed to load users'
  } finally {
    loading.value = false
  }
}

function resetAddForm() {
  addEmail.value = ''
  addPassword.value = ''
  addRole.value = 'BU'
  addEmailVerified.value = false
  formError.value = ''
}

async function handleAdd() {
  if (!addEmail.value.trim()) {
    formError.value = 'Email is required'
    return
  }

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        email: addEmail.value,
        password: addPassword.value || undefined,
        role: addRole.value,
        emailVerified: addEmailVerified.value
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create user')
    }

    showAddModal.value = false
    resetAddForm()
    await fetchUsers()
  } catch (error) {
    console.error('Error creating user:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to create user'
  }
}

function openEditModal(user: UserListItem) {
  editingUser.value = user
  editEmail.value = user.email
  editPassword.value = '' // Leave blank unless changing
  editRole.value = user.role
  editIsActive.value = user.isActive
  editEmailVerified.value = user.emailVerified
  formError.value = ''
  showEditModal.value = true
}

async function handleUpdate() {
  if (!editingUser.value) return

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/users/${editingUser.value.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        role: editRole.value,
        isActive: editIsActive.value,
        emailVerified: editEmailVerified.value,
        password: editPassword.value || undefined // Only update if provided
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to update user')
    }

    showEditModal.value = false
    editingUser.value = null
    await fetchUsers()
  } catch (error) {
    console.error('Error updating user:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to update user'
  }
}

async function handleDeactivate(user: UserListItem) {
  if (!confirm(`Are you sure you want to deactivate "${user.email}"?`)) return

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch(`/api/users/${user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error(`Failed to deactivate user`)

    await fetchUsers()
  } catch (error) {
    console.error('Error deactivating user:', error)
    formError.value = 'Failed to deactivate user'
  }
}

function handleSearch() {
  currentPage.value = 1
  fetchUsers()
}

let searchTimeout: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => handleSearch(), 300)
}

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
    fetchUsers()
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString()
}

const roleColors: Record<string, string> = {
  BU: 'bg-blue-100 text-blue-800',
  ADMIN: 'bg-purple-100 text-purple-800',
  SA: 'bg-red-100 text-red-800'
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">User Management</h2>
          <p class="text-sm text-gray-600">{{ totalCount.toLocaleString() }} users in your organization (Superadmin only)</p>
        </div>
        <button
          @click="showAddModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          + Add User
        </button>
      </div>

      <!-- Error Message -->
      <div v-if="formError && !showAddModal && !showEditModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Search Bar -->
      <div class="mb-6 flex items-center space-x-4">
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          type="text"
          placeholder="Search by email or role..."
          class="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading users...</p>
      </div>

      <!-- Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Verified</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            <tr v-if="users.length === 0">
              <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
                No users found. Click "Add User" to create one.
              </td>
            </tr>
            <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ user.email }}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', roleColors[user.role]]">
                  {{ user.role }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="[
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                ]">
                  {{ user.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="[
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                  user.emailVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                ]">
                  {{ user.emailVerified ? 'Verified' : 'Pending' }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ formatDate(user.createdAt) }}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button @click="openEditModal(user)" class="text-blue-600 hover:text-blue-900">Edit</button>
                <span v-if="user.isActive">|</span>
                <button v-if="user.isActive" @click="handleDeactivate(user)" class="text-red-600 hover:text-red-900">Deactivate</button>
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

      <!-- ─── Add User Modal ──────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add New User</h3>
                  <form @submit.prevent="handleAdd" class="space-y-4">
                    <div>
                      <label for="add-email" class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input id="add-email" v-model="addEmail" type="email" required placeholder="user@example.com" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="add-password" class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input id="add-password" v-model="addPassword" type="password" required minlength="8" placeholder="At least 8 characters" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="add-role" class="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                      <select id="add-role" v-model="addRole" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="BU">Business User (BU)</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    </div>
                    <div class="flex items-center">
                      <input id="add-emailVerified" v-model="addEmailVerified" type="checkbox" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                      <label for="add-emailVerified" class="ml-2 block text-sm text-gray-700">Skip email verification</label>
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleAdd" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Create User</button>
                  <button @click="showAddModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ─── Edit User Modal ─────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-1">Edit User</h3>
                  <p class="text-sm text-gray-500">{{ editingUser?.email }}</p>

                  <form @submit.prevent="handleUpdate" class="space-y-4 mt-4">
                    <div>
                      <label for="edit-role" class="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                      <select id="edit-role" v-model="editRole" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="BU">Business User (BU)</option>
                        <option value="ADMIN">Administrator</option>
                        <option value="SA">Superadmin (SA)</option>
                      </select>
                    </div>
                    <div class="flex items-center space-x-6">
                      <label class="flex items-center">
                        <input v-model="editIsActive" type="checkbox" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                        <span class="ml-2 text-sm text-gray-700">Active</span>
                      </label>
                      <label class="flex items-center">
                        <input v-model="editEmailVerified" type="checkbox" class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                        <span class="ml-2 text-sm text-gray-700">Email Verified</span>
                      </label>
                    </div>
                    <div>
                      <label for="edit-password" class="block text-sm font-medium text-gray-700 mb-1">New Password (leave blank to keep current)</label>
                      <input id="edit-password" v-model="editPassword" type="password" minlength="8" placeholder="Optional — only change if needed" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>

                    <div class="flex space-x-3 pt-4">
                      <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Save Changes</button>
                      <button type="button" @click="showEditModal = false" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                    </div>
                  </form>
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
