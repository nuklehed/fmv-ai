<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

interface HcpOption {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
  state?: string
  specialtyId?: string
  specialtyName?: string
}

const router = useRouter()

// Form state
const selectedHcp = ref<HcpOption | null>(null)
const hcpSearchQuery = ref('')
const hcpSuggestions = ref<HcpOption[]>([])
const showHcpDropdown = ref(false)
const showNewHcpForm = ref(false)

// Editable contact fields (pre-populated from HCP master record)
const editEmail = ref('')
const editPhone = ref('')
const editAddress = ref('')
const editState = ref('')

// Assessment metadata
const specialtyId = ref('')
const criteriaSetId = ref('')
const additionalContext = ref('')

// CV upload state
const cvFile = ref<File | null>(null)
const cvFileName = ref('')
const cvUploadProgress = ref(0)
const cvUploaded = ref(false)
const cvTextLength = ref(0)

// New HCP creation state
const newHcpForm = ref({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  state: '',
  specialtyId: '' as string,
  identifiers: [] as { type: string; value: string }[]
})
const isCreatingHcp = ref(false)

// Form validation and status
const formError = ref('')
const formSuccess = ref('')
const isSubmitting = ref(false)
const isUploadingCv = ref(false)

// Specialty list (loaded once)
const specialties = ref<{ id: string; name: string }[]>([])

// Criteria sets list (loaded once, Admin/SA only — but BU can see available ones)
const criteriaSets = ref<{ id: string; name: string }[]>([])

// HCP search debounce
let hcpSearchTimeout: ReturnType<typeof setTimeout> | null = null

async function fetchHcps(query: string) {
  try {
    const token = localStorage.getItem('accessToken')
    const params = new URLSearchParams({ page: '1', limit: '20', search: query || '' })
    const response = await fetch(`/api/hcps?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) throw new Error('Failed to fetch HCPs')
    const result = await response.json()
    hcpSuggestions.value = result.data
  } catch (error) {
    console.error('Error fetching HCP suggestions:', error)
  }
}

function onHcpSearchInput() {
  if (hcpSearchTimeout) clearTimeout(hcpSearchTimeout)
  const query = hcpSearchQuery.value.trim()
  if (query.length < 2) {
    hcpSuggestions.value = []
    return
  }
  hcpSearchTimeout = setTimeout(() => fetchHcps(query), 300)
}

function selectHcp(hcp: HcpOption) {
  selectedHcp.value = hcp
  hcpSearchQuery.value = `${hcp.firstName} ${hcp.lastName}`
  hcpSuggestions.value = []
  showHcpDropdown.value = false
  showNewHcpForm.value = false

  // Pre-populate editable fields from HCP master record
  editEmail.value = hcp.email || ''
  editPhone.value = hcp.phone || ''
  editAddress.value = hcp.address || ''
  editState.value = hcp.state || ''
  specialtyId.value = hcp.specialtyId || ''

  // Reset CV upload state when switching HCPs
  resetCvUpload()
}

async function createNewHcp() {
  if (!newHcpForm.value.firstName.trim() || !newHcpForm.value.lastName.trim()) {
    formError.value = 'First name and last name are required'
    return
  }

  isCreatingHcp.value = true
  formError.value = ''

  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/hcps/bu-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        firstName: newHcpForm.value.firstName.trim(),
        lastName: newHcpForm.value.lastName.trim(),
        email: newHcpForm.value.email || null,
        phone: newHcpForm.value.phone || null,
        address: newHcpForm.value.address || null,
        state: newHcpForm.value.state || null,
        specialtyId: newHcpForm.value.specialtyId || null,
        identifiers: newHcpForm.value.identifiers.length > 0 ? newHcpForm.value.identifiers : undefined
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create HCP')
    }

    const createdHcp = await response.json()
    
    // Create a temporary HCP option for the form
    const hcpOption: HcpOption = {
      id: createdHcp.id,
      firstName: createdHcp.firstName,
      lastName: createdHcp.lastName,
      email: createdHcp.email || '',
      phone: createdHcp.phone || '',
      address: createdHcp.address || '',
      state: createdHcp.state || '',
      specialtyId: createdHcp.specialty?.id || '',
      specialtyName: createdHcp.specialty?.name || ''
    }

    selectHcp(hcpOption)
    showNewHcpForm.value = false
    formSuccess.value = 'New HCP created successfully'
  } catch (error) {
    console.error('Error creating HCP:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to create HCP'
  } finally {
    isCreatingHcp.value = false
  }
}

function handleHcpInputFocus() {
  if (hcpSearchQuery.value.trim().length >= 2) {
    showHcpDropdown.value = true
  }
}

// ─── Specialty & Criteria Sets Loading ──────────────────────────────

async function fetchSpecialties() {
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/specialties?active=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) specialties.value = await response.json()
  } catch (error) {
    console.error('Error fetching specialties:', error)
  }
}

async function fetchCriteriaSets() {
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/criteria-sets?active=true', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) criteriaSets.value = await response.json()
  } catch (error) {
    console.error('Error fetching criteria sets:', error)
  }
}

// ─── CV Upload ──────────────────────────────────────────────────────

function handleCvFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.type !== 'application/pdf') {
    formError.value = 'Only PDF files are allowed'
    return
  }

  if (file.size > 10 * 1024 * 1024) {
    formError.value = 'File size must be under 10MB'
    return
  }

  cvFile.value = file
  cvFileName.value = file.name
  formError.value = ''
}

async function uploadCv() {
  if (!cvFile.value || !selectedHcp.value) return

  isUploadingCv.value = true
  formError.value = ''
  cvUploadProgress.value = 30

  try {
    // Step 1: Create assessment draft
    const token = localStorage.getItem('accessToken')
    const createResponse = await fetch('/api/assessments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        hcpId: selectedHcp.value.id,
        specialtyId: specialtyId.value || null,
        criteriaSetId: criteriaSetId.value || null
      })
    })

    if (!createResponse.ok) {
      const errorData = await createResponse.json()
      throw new Error(errorData.error || 'Failed to create assessment')
    }

    const assessment = await createResponse.json()
    cvUploadProgress.value = 60

    // Step 2: Upload CV PDF
    const formData = new FormData()
    formData.append('cv', cvFile.value)

    const uploadResponse = await fetch(`/api/assessments/${assessment.id}/cv`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
      // Don't set Content-Type — browser will set it with boundary for FormData
    })

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json()
      throw new Error(errorData.error || 'Failed to upload CV')
    }

    const uploadResult = await uploadResponse.json()
    cvTextLength.value = uploadResult.textLength
    cvUploaded.value = true
    cvUploadProgress.value = 100

    formSuccess.value = `CV uploaded successfully (${cvTextLength.value} characters extracted)`
  } catch (error) {
    console.error('Error uploading CV:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to upload CV'
    cvUploaded.value = false
  } finally {
    isUploadingCv.value = false
    setTimeout(() => { cvUploadProgress.value = 0 }, 1000)
  }
}

function resetCvUpload() {
  cvFile.value = null
  cvFileName.value = ''
  cvUploadProgress.value = 0
  cvUploaded.value = false
  cvTextLength.value = 0
  formSuccess.value = ''
}

// ─── Form Submission ────────────────────────────────────────────────

async function handleSubmit() {
  // Validate required fields
  if (!selectedHcp.value) {
    formError.value = 'Please select an HCP'
    return
  }

  if (!cvUploaded.value) {
    formError.value = 'CV upload is required before submission'
    return
  }

  isSubmitting.value = true
  formError.value = ''
  formSuccess.value = ''

  try {
    const token = localStorage.getItem('accessToken')

    // Step 1: Update HCP contact info if changed
    const needsHcpUpdate = (
      editEmail.value !== selectedHcp.value.email ||
      editPhone.value !== selectedHcp.value.phone ||
      editAddress.value !== selectedHcp.value.address ||
      editState.value !== selectedHcp.value.state
    )

    if (needsHcpUpdate) {
      await fetch(`/api/hcps/${selectedHcp.value.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          email: editEmail.value || null,
          phone: editPhone.value || null,
          address: editAddress.value || null,
          state: editState.value || null
        })
      })
    }

    // Step 2: Submit assessment for AI processing
    const response = await fetch(`/api/assessments/${selectedHcp.value.id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to submit assessment')
    }

    const result = await response.json()
    formSuccess.value = `Assessment submitted! Queue position: ${result.queuePosition}`

    // Redirect to assessments list after a brief delay
    setTimeout(() => {
      router.push('/assessments')
    }, 2000)
  } catch (error) {
    console.error('Error submitting assessment:', error)
    formError.value = error instanceof Error ? error.message : 'Failed to submit assessment'
  } finally {
    isSubmitting.value = false
  }
}

// ─── Computed ───────────────────────────────────────────────────────

const canSubmit = computed(() => {
  return selectedHcp.value && cvUploaded.value && !isSubmitting.value
})

onMounted(() => {
  fetchSpecialties()
  fetchCriteriaSets()
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
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-1">Request Assessment</h2>
        <p class="text-sm text-gray-600">Submit an HCP's CV for AI-powered FMV evaluation</p>
      </div>

      <!-- Error / Success Messages -->
      <div v-if="formError" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
        <svg class="h-5 w-5 text-red-400 mt-0.5 mr-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <div v-if="formSuccess" class="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
        <svg class="h-5 w-5 text-green-400 mt-0.5 mr-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <p class="text-sm text-green-600">{{ formSuccess }}</p>
      </div>

      <!-- Form Steps -->
      <div class="space-y-6">
        <!-- Step 1: Select HCP -->
        <section class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">1</span>
            Select HCP
          </h3>

          <!-- HCP Search -->
          <div class="relative">
            <label for="hcp-search" class="block text-sm font-medium text-gray-700 mb-1">Search Healthcare Professional *</label>
            <input
              id="hcp-search"
              v-model="hcpSearchQuery"
              @focus="handleHcpInputFocus"
              @input="onHcpSearchInput"
              type="text"
              placeholder="Type at least 2 characters to search..."
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <!-- HCP Suggestions Dropdown -->
            <Teleport to="body">
              <div v-if="showHcpDropdown && hcpSuggestions.length > 0" class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                <div
                  v-for="hcp in hcpSuggestions"
                  :key="hcp.id"
                  @click="selectHcp(hcp)"
                  class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-900">{{ hcp.firstName }} {{ hcp.lastName }}</span>
                    <span v-if="hcp.state" class="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{{ hcp.state }}</span>
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5">
                    {{ hcp.email || 'No email' }} · {{ hcp.specialtyName || 'No specialty' }}
                  </div>
                </div>
              </div>
            </Teleport>

            <!-- Create New HCP Button -->
            <button
              @click="showNewHcpForm = !showNewHcpForm"
              class="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              + Create New HCP
            </button>
          </div>

          <!-- New HCP Form -->
          <Transition name="slide-fade">
            <div v-if="showNewHcpForm" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 class="text-sm font-semibold text-blue-900 mb-3">Create New Healthcare Professional</h4>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="new-hcp-first-name" class="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    id="new-hcp-first-name"
                    v-model="newHcpForm.firstName"
                    type="text"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label for="new-hcp-last-name" class="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    id="new-hcp-last-name"
                    v-model="newHcpForm.lastName"
                    type="text"
                    required
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label for="new-hcp-email" class="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="new-hcp-email"
                    v-model="newHcpForm.email"
                    type="email"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label for="new-hcp-phone" class="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    id="new-hcp-phone"
                    v-model="newHcpForm.phone"
                    type="tel"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div class="sm:col-span-2">
                  <label for="new-hcp-address" class="block text-xs font-medium text-gray-700 mb-1">Address</label>
                  <input
                    id="new-hcp-address"
                    v-model="newHcpForm.address"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label for="new-hcp-state" class="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input
                    id="new-hcp-state"
                    v-model="newHcpForm.state"
                    type="text"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label for="new-hcp-specialty" class="block text-xs font-medium text-gray-700 mb-1">Specialty</label>
                  <select
                    id="new-hcp-specialty"
                    v-model="newHcpForm.specialtyId"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select specialty...</option>
                    <option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
              </div>

              <div class="mt-4 flex space-x-3">
                <button
                  @click="createNewHcp"
                  :disabled="isCreatingHcp || !newHcpForm.firstName.trim() || !newHcpForm.lastName.trim()"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  {{ isCreatingHcp ? 'Creating...' : 'Create HCP' }}
                </button>
                <button
                  @click="showNewHcpForm = false"
                  class="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Transition>

          <!-- Selected HCP Summary -->
          <div v-if="selectedHcp" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-semibold text-blue-900">{{ selectedHcp.firstName }} {{ selectedHcp.lastName }}</span>
              <button @click="selectedHcp = null; hcpSearchQuery = ''" class="text-xs text-blue-600 hover:text-blue-800">Clear</button>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span class="text-gray-500">Email:</span><span class="text-gray-900">{{ selectedHcp.email || '—' }}</span>
              <span class="text-gray-500">Phone:</span><span class="text-gray-900">{{ selectedHcp.phone || '—' }}</span>
              <span class="text-gray-500">State:</span><span class="text-gray-900">{{ selectedHcp.state || '—' }}</span>
              <span class="text-gray-500">Specialty:</span><span class="text-gray-900">{{ selectedHcp.specialtyName || '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Step 2: Edit Contact Info -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">2</span>
            Contact Information (editable)
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="edit-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input id="edit-email" v-model="editEmail" type="email" placeholder="hcp@example.com" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-phone" class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input id="edit-phone" v-model="editPhone" type="tel" placeholder="(555) 123-4567" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div class="sm:col-span-2">
              <label for="edit-address" class="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input id="edit-address" v-model="editAddress" type="text" placeholder="Street address" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-state" class="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input id="edit-state" v-model="editState" type="text" placeholder="e.g., CA, NY" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          <p class="mt-3 text-xs text-gray-500">Changes to contact info will be saved to the HCP master record.</p>
        </section>

        <!-- Step 3: Assessment Details -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">3</span>
            Assessment Details
          </h3>

          <div class="space-y-4">
            <!-- Specialty -->
            <div>
              <label for="specialty" class="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
              <select id="specialty" v-model="specialtyId" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="">Select specialty...</option>
                <option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <!-- Criteria Set -->
            <div>
              <label for="criteria-set" class="block text-sm font-medium text-gray-700 mb-1">Criteria Set</label>
              <select id="criteria-set" v-model="criteriaSetId" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option value="">Select criteria set...</option>
                <option v-for="cs in criteriaSets" :key="cs.id" :value="cs.id">{{ cs.name }}</option>
              </select>
            </div>

            <!-- Additional Context -->
            <div>
              <label for="context" class="block text-sm font-medium text-gray-700 mb-1">Additional Context (optional)</label>
              <textarea id="context" v-model="additionalContext" rows="3" placeholder="Any additional notes about this assessment request..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
            </div>
          </div>
        </section>

        <!-- Step 4: CV Upload -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">4</span>
            Upload CV / Resume (PDF) *
          </h3>

          <!-- File Input -->
          <div v-if="!cvFileName" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            <input
              id="cv-upload"
              type="file"
              accept=".pdf,application/pdf"
              @change="handleCvFileChange"
              class="hidden"
            />
            <label for="cv-upload" class="cursor-pointer">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p class="mt-2 text-sm font-medium text-gray-900">Click to upload or drag and drop</p>
              <p class="text-xs text-gray-500 mt-1">PDF files only, max 10MB</p>
            </label>
          </div>

          <!-- File Selected -->
          <div v-else-if="!isUploadingCv && !cvUploaded" class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div class="flex items-center space-x-3">
              <svg class="h-8 w-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
              </svg>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ cvFileName }}</p>
                <p class="text-xs text-gray-500">{{ (cvFile!.size / 1024).toFixed(1) }} KB</p>
              </div>
            </div>
            <button @click="resetCvUpload" class="text-sm text-red-600 hover:text-red-800">Remove</button>
          </div>

          <!-- Upload Progress -->
          <div v-if="isUploadingCv" class="space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-700">{{ cvUploadProgress < 50 ? 'Creating assessment...' : 'Extracting CV text...' }}</span>
              <span class="font-medium text-blue-600">{{ cvUploadProgress }}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" :style="{ width: cvUploadProgress + '%' }"></div>
            </div>
          </div>

          <!-- Upload Success -->
          <div v-if="cvUploaded" class="flex items-center space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <svg class="h-6 w-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <div>
              <p class="text-sm font-medium text-green-900">CV uploaded successfully</p>
              <p class="text-xs text-green-700">{{ cvTextLength }} characters extracted from PDF</p>
            </div>
          </div>

          <!-- Upload Button -->
          <button
            v-if="cvFileName && !isUploadingCv && !cvUploaded"
            @click="uploadCv"
            class="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium transition-colors"
          >
            Upload & Extract Text
          </button>
        </section>

        <!-- Submit Button -->
        <div v-if="selectedHcp && cvUploaded" class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-900">Ready to submit</p>
              <p class="text-xs text-gray-500">The AI will evaluate the CV against your criteria set. This may take several minutes.</p>
            </div>
            <button
              @click="handleSubmit"
              :disabled="!canSubmit || isSubmitting"
              class="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm font-medium transition-colors flex items-center space-x-2"
            >
              <svg v-if="isSubmitting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ isSubmitting ? 'Submitting...' : 'Submit for AI Processing' }}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Drag and drop visual feedback */
.border-dashed:hover {
  border-color: #60a5fa;
}

/* Slide-fade transition for new HCP form */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
