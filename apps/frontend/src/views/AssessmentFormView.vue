<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as assessmentDomain from '@/domain/assessment'

interface HcpOption {
  id: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  country?: string
  specialtyId?: string
  specialtyName?: string
}

// ─── Route State ──────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()
const isEditMode = computed(() => !!route.params.id)
const draftId = computed(() => route.params.id as string | undefined)

// Reload draft data when navigating between assessments or from new → edit
watch([draftId, isEditMode], ([newDraftId, newIsEditMode]) => {
  if (newDraftId && newIsEditMode) loadDraft()
})

// ─── UI State (kept in view for reactivity) ───────────────────────

const selectedHcp = ref<HcpOption | null>(null)
const isNewHcp = ref(false)
const hcpSearchQuery = ref('')
const hcpSuggestions = ref<HcpOption[]>([])
const showHcpDropdown = ref(false)
const showNewHcpForm = ref(false)

const editEmail = ref('')
const editPhone = ref('')
const editAddress = ref('')
const editCity = ref('')
const editState = ref('')
const editCountry = ref('US')

const specialtyId = ref('')
const criteriaSetId = ref('')
const additionalContext = ref('')

const cvFile = ref<File | null>(null)
const cvFileName = ref('')
const cvUploadProgress = ref(0)
const cvUploaded = ref(false)
const cvTextLength = ref(0)
const createdAssessmentId = ref<string | null>(null)

const newHcpForm = ref({
  firstName: '', lastName: '', email: '', phone: '', address: '', city: '', state: '', country: 'US',
  specialtyId: '' as string, identifiers: [] as { type: string; value: string }[]
})
const isCreatingHcp = ref(false)

const formError = ref('')
const formSuccess = ref('')
const submissionBanner = ref<{ show: boolean; message: string; isError?: boolean }>({ show: false, message: '', isError: false })
const countdownSeconds = ref(4)
let countdownTimer: ReturnType<typeof setInterval> | null = null
const isSubmitting = ref(false)
const isUploadingCv = ref(false)

// Active assessment warning (Issue #35 — supersession awareness)
const activeAssessmentInfo = ref<{ hasActive: boolean; assessment?: { id: string; status: string; totalScore?: number | null; tierLabel?: string | null; rate?: number | null; renewalDate?: string | null } }>({ hasActive: false })
const showActiveWarning = ref(false)

const specialties = ref<{ id: string; name: string; criteriaSetId?: string | null }[]>([])

let hcpSearchTimeout: ReturnType<typeof setTimeout> | null = null

// ─── HCP Search (debounced) ──────────────────────────────────────

async function fetchHcps(query: string) {
  try {
    const suggestions = await assessmentDomain.searchHcps(query)
    hcpSuggestions.value = suggestions.map((h: any) => ({
      id: h.id, firstName: h.firstName, lastName: h.lastName,
      email: h.email || '', phone: h.phone || '', address: h.address || '', city: h.city || '',
      state: h.state || '', country: h.country || 'US', specialtyId: h.specialtyId || '', specialtyName: h.specialtyName || ''
    }))
  } catch { /* silent */ }
}

function onHcpSearchInput() {
  if (hcpSearchTimeout) clearTimeout(hcpSearchTimeout)
  const query = hcpSearchQuery.value.trim()
  if (query.length < 2) { hcpSuggestions.value = []; return }
  showHcpDropdown.value = true
  hcpSearchTimeout = setTimeout(() => fetchHcps(query), 300)
}

async function selectHcp(hcp: HcpOption) {
  selectedHcp.value = hcp
  isNewHcp.value = false
  hcpSearchQuery.value = `${hcp.firstName} ${hcp.lastName}`
  hcpSuggestions.value = []
  showHcpDropdown.value = false
  showNewHcpForm.value = false

  editEmail.value = hcp.email || ''
  editPhone.value = hcp.phone || ''
  editAddress.value = hcp.address || ''
  editCity.value = hcp.city || ''
  editState.value = hcp.state || ''
  editCountry.value = hcp.country || 'US'
  specialtyId.value = hcp.specialtyId || ''

  // Check for active assessments & existing drafts (Issue #35)
  let hasExistingDraftWithCv = false
  try {
    const existingDraft = await assessmentDomain.findExistingDraftForHcp(hcp.id)
    if (existingDraft && existingDraft.cvText) {
      hasExistingDraftWithCv = true
      // Existing draft with CV already uploaded — pre-fill it
      cvUploaded.value = true
      cvTextLength.value = existingDraft.cvText.length
      cvFileName.value = 'CV from existing draft'
      createdAssessmentId.value = existingDraft.id
      formSuccess.value = `Continuing existing draft assessment for ${hcp.firstName} ${hcp.lastName}`
    }
  } catch { /* silent */ }

  // Check active assessments — supersession warning (only in create mode, not when continuing a draft)
  try {
    const result = await assessmentDomain.fetchActiveAssessment(hcp.id)
    activeAssessmentInfo.value = result
    showActiveWarning.value = !!result.hasActive && !hasExistingDraftWithCv && !isEditMode.value
  } catch { /* silent */ }
}

// ─── Active Assessment Warning (Issue #35) ─────────────────────────

function clearActiveWarning() {
  showActiveWarning.value = false
}

// ─── New HCP Creation ─────────────────────────────────────────────

async function createNewHcp() {
  if (!newHcpForm.value.firstName.trim() || !newHcpForm.value.lastName.trim()) {
    formError.value = 'First name and last name are required'
    return
  }

  isCreatingHcp.value = true
  formError.value = ''

  try {
    const createdHcp = await assessmentDomain.createHcp({
      firstName: newHcpForm.value.firstName.trim(),
      lastName: newHcpForm.value.lastName.trim(),
      email: newHcpForm.value.email || null,
      phone: newHcpForm.value.phone || null,
      address: newHcpForm.value.address || null,
      city: newHcpForm.value.city || null,
      state: newHcpForm.value.state || null,
      country: newHcpForm.value.country || 'US',
      specialtyId: newHcpForm.value.specialtyId || null,
      identifiers: newHcpForm.value.identifiers.length > 0 ? newHcpForm.value.identifiers : undefined
    })

    selectHcp({
      id: createdHcp.id, firstName: createdHcp.firstName, lastName: createdHcp.lastName,
      email: createdHcp.email || '', phone: createdHcp.phone || '',
      address: createdHcp.address || '', city: createdHcp.city || '',
      state: createdHcp.state || '', country: createdHcp.country || 'US',
      specialtyId: createdHcp.specialty?.id || '', specialtyName: createdHcp.specialty?.name || ''
    })
    isNewHcp.value = true
    showNewHcpForm.value = false
    formSuccess.value = 'New HCP created successfully'
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to create HCP'
  } finally {
    isCreatingHcp.value = false
  }
}

function handleHcpInputFocus() {
  if (hcpSearchQuery.value.trim().length >= 2) showHcpDropdown.value = true
}

// ─── CV Upload ─────────────────────────────────────────────────────

function handleCvFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.type !== 'application/pdf') { formError.value = 'Only PDF files are allowed'; return }
  if (file.size > 10 * 1024 * 1024) { formError.value = 'File size must be under 10MB'; return }

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
    // Step 1: Check for existing DRAFT for this HCP — reuse it instead of creating a duplicate
    let draftId: string
    let existingDraft = await assessmentDomain.findExistingDraftForHcp(selectedHcp.value.id)
    if (existingDraft) {
      draftId = existingDraft.id
    } else {
      const newDraft = await assessmentDomain.createDraft(
        selectedHcp.value.id, specialtyId.value || null, criteriaSetId.value || null
      )
      draftId = newDraft.id
    }
    createdAssessmentId.value = draftId
    cvUploadProgress.value = 60

    // Step 2: Upload CV PDF
    const result = await assessmentDomain.uploadCv(draftId, cvFile.value)
    cvTextLength.value = result.textLength
    cvUploaded.value = true
    cvUploadProgress.value = 100
    formSuccess.value = `CV uploaded successfully (${cvTextLength.value} characters extracted)`

    // Navigate to edit mode with the correct draft ID so submit uses the right assessment
    router.push(`/assessments/edit/${draftId}`)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to upload CV'
    cvUploaded.value = false
  } finally {
    isUploadingCv.value = false
    setTimeout(() => { cvUploadProgress.value = 0 }, 1000)
  }
}

function resetCvUpload() {
  cvFile.value = null; cvFileName.value = ''
  cvUploadProgress.value = 0; cvUploaded.value = false
  cvTextLength.value = 0; formSuccess.value = ''
  createdAssessmentId.value = null
}

// ─── Form Submission ──────────────────────────────────────────────

async function handleSubmit() {
  if (!selectedHcp.value) { formError.value = 'Please select an HCP'; return }
  if (!cvUploaded.value) { formError.value = 'CV upload is required before submission'; return }

  // Pre-flight: check LLM availability
  try {
    const health = await assessmentDomain.checkLlmHealth()
    if (!health.ok) {
      throw new Error(health.error || 'The local AI model (Ollama) is not available. Please ensure Ollama is running with qwen3.6-35b-a3b loaded.')
    }
  } catch (err) {
    formError.value = err instanceof Error ? err.message : 'Failed to check LLM availability'
    return
  }

  isSubmitting.value = true
  formError.value = ''
  formSuccess.value = ''

  try {
    // Update HCP contact info if changed
    const needsHcpUpdate = (
      editEmail.value !== selectedHcp.value.email ||
      editPhone.value !== selectedHcp.value.phone ||
      editAddress.value !== selectedHcp.value.address ||
      editCity.value !== selectedHcp.value.city ||
      editState.value !== selectedHcp.value.state ||
      editCountry.value !== selectedHcp.value.country
    )

    if (needsHcpUpdate) {
      await assessmentDomain.updateHcp(selectedHcp.value.id, {
        email: editEmail.value || null, phone: editPhone.value || null,
        address: editAddress.value || null, city: editCity.value || null,
        state: editState.value || null, country: editCountry.value || 'US'
      })
    }

    if (isEditMode.value && draftId.value) {
      // ─── EDIT MODE ──────────────────────────────────────────────

      // Guard: only submit DRAFT assessments
      const currentDraft = await assessmentDomain.fetchAssessment(draftId.value)
      if (currentDraft.status !== 'DRAFT') {
        throw new Error(`This assessment is already ${assessmentDomain.StatusLabels[currentDraft.status] || currentDraft.status}. It cannot be submitted again.`)
      }

      // Update assessment fields
      await assessmentDomain.updateDraft(draftId.value, {
        specialtyId: specialtyId.value || null, criteriaSetId: criteriaSetId.value || null
      })

      // Upload CV if not already uploaded
      if (!cvUploaded.value && cvFile.value) {
        await assessmentDomain.uploadCv(draftId.value, cvFile.value)
      }

      // Submit for AI processing
      await assessmentDomain.submitForAi(draftId.value)
      submissionBanner.value.isError = false
      countdownSeconds.value = 4
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = setInterval(() => {
        countdownSeconds.value--
        if (countdownSeconds.value <= 0) { clearInterval(countdownTimer!); countdownTimer = null }
      }, 1000)
      submissionBanner.value = {
        show: true,
        message: 'Your assessment has been submitted for AI evaluation. This may take a few minutes while our local LLM analyzes the CV.'
      }
    } else {
      // ─── CREATE MODE (legacy path — uploadCv already creates draft) ──
      // In create mode, the CV upload flow above already created the draft.
      // If we reach here without uploading CV first, submit directly.
      if (!cvUploaded.value && !cvFile.value) {
        throw new Error('CV upload is required before submission')
      }

      // Use the assessment ID created during CV upload
      if (!createdAssessmentId.value) {
        throw new Error('No assessment found — please upload a CV first')
      }
      const response = await fetch(`/api/assessments/${createdAssessmentId.value}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to submit assessment' }))
        throw new Error(errorData.error || 'Failed to submit assessment')
      }

      submissionBanner.value.isError = false
      countdownSeconds.value = 4
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = setInterval(() => {
        countdownSeconds.value--
        if (countdownSeconds.value <= 0) { clearInterval(countdownTimer!); countdownTimer = null }
      }, 1000)
      submissionBanner.value = {
        show: true,
        message: 'Your assessment has been submitted for AI evaluation. This may take a few minutes while our local LLM analyzes the CV.'
      }
    }

    // Redirect after showing banner — list auto-refreshes for AI_PROCESSING
    const redirectDelay = submissionBanner.value.isError ? 8000 : 4000
    setTimeout(() => {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
      router.push('/assessments')
    }, redirectDelay)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to submit assessment'
    // Show errors in the banner so they're visible before redirect
    submissionBanner.value.isError = true
    submissionBanner.value.show = true
    submissionBanner.value.message = `Submission failed: ${errorMsg}`
    countdownSeconds.value = 8
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      countdownSeconds.value--
      if (countdownSeconds.value <= 0) { clearInterval(countdownTimer!); countdownTimer = null }
    }, 1000)
  } finally {
    isSubmitting.value = false
  }
}

// ─── Draft Loading (Edit Mode) ────────────────────────────────────

async function loadDraft() {
  if (!draftId.value || !isEditMode.value) return

  formError.value = ''
  isSubmitting.value = true

  try {
    const draft = await assessmentDomain.fetchAssessment(draftId.value)

    // Guard: only allow editing DRAFT assessments. Redirect away for others.
    if (draft.status !== 'DRAFT') {
      const statusLabel = assessmentDomain.StatusLabels[draft.status] || draft.status
      formError.value = `This assessment is ${statusLabel} and cannot be edited.`
      // Show banner with redirect
      submissionBanner.value.isError = true
      submissionBanner.value.show = true
      submissionBanner.value.message = `Cannot edit — this assessment is ${statusLabel}. Redirecting to assessments list…`
      countdownSeconds.value = 5
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = setInterval(() => {
        countdownSeconds.value--
        if (countdownSeconds.value <= 0) { clearInterval(countdownTimer!); countdownTimer = null }
      }, 1000)
      setTimeout(() => {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
        router.push('/assessments')
      }, 5000)
      return
    }

    selectedHcp.value = {
      id: draft.hcpId, firstName: draft.hcp?.firstName || '', lastName: draft.hcp?.lastName || '',
      email: draft.hcp?.email || '', phone: draft.hcp?.phone || '',
      address: draft.hcp?.address || '', state: draft.hcp?.state || '',
      specialtyId: draft.specialtyId || '', specialtyName: draft.specialty?.name || ''
    }

    editEmail.value = selectedHcp.value.email || ''
    editPhone.value = selectedHcp.value.phone || ''
    editAddress.value = selectedHcp.value.address || ''
    editCity.value = selectedHcp.value.city || ''
    editState.value = selectedHcp.value.state || ''
    editCountry.value = selectedHcp.value.country || 'US'

    specialtyId.value = draft.specialtyId || ''
    criteriaSetId.value = draft.criteriaSetId || ''

    if (draft.cvText) {
      cvUploaded.value = true; cvTextLength.value = draft.cvText.length
      cvFileName.value = 'CV previously uploaded'
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to load draft assessment'
  } finally {
    isSubmitting.value = false
  }
}

// ─── Computed ──────────────────────────────────────────────────────

const canSubmit = computed(() => {
  if (!selectedHcp.value || !cvUploaded.value || isSubmitting.value) return false
  // In edit mode, only allow submit for DRAFT assessments
  if (isEditMode.value && draftId.value) {
    // We check status in handleSubmit; this computed just gates the button
    return true
  }
  return true
})

// ─── Auto-resolve criteria set from specialty ──────────────────────
watch(specialtyId, (newSpecialtyId) => {
  if (newSpecialtyId) {
    const specialty = specialties.value.find(s => s.id === newSpecialtyId)
    criteriaSetId.value = specialty?.criteriaSetId || ''
  } else {
    criteriaSetId.value = ''
  }
})

// ─── Pre-select HCP from query param (sidebar navigation) ─────────

async function preselectHcpFromQuery(hcpId: string) {
  try {
    const hcp = await assessmentDomain.fetchHcpProfile(hcpId)
    selectHcp({
      id: hcp.hcp.id,
      firstName: hcp.hcp.firstName,
      lastName: hcp.hcp.lastName,
      email: hcp.hcp.email || '',
      phone: hcp.hcp.phone || '',
      address: hcp.hcp.address || '',
      city: hcp.hcp.city || '',
      state: hcp.hcp.state || '',
      country: hcp.hcp.country,
      specialtyId: hcp.hcp.specialtyId || '',
      specialtyName: hcp.hcp.specialtyName || ''
    })
    formSuccess.value = `Pre-selected ${hcp.hcp.firstName} ${hcp.hcp.lastName} from profile`
  } catch {
    // HCP not found — silently ignore, user can search manually
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────

onMounted(async () => {
  try { specialties.value = await assessmentDomain.fetchSpecialties() } catch { /* silent */ }
  if (isEditMode.value) loadDraft()
  else {
    const hcpId = route.query.hcpId as string | undefined
    if (hcpId) preselectHcpFromQuery(hcpId)
  }
})
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <!-- Non-DRAFT Assessment Warning -->
      <Transition name="slide-fade">
        <div v-if="isEditMode && draftId && !selectedHcp" class="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-5 flex items-start shadow-sm">
          <i class="pi pi-exclamation-triangle h-6 w-6 text-yellow-500 mt-0.5 mr-3 shrink-0"></i>
          <div class="flex-1">
            <p class="text-sm font-semibold text-yellow-900 mb-1">Assessment Cannot Be Edited</p>
            <p class="text-sm text-yellow-700">{{ formError }}</p>
            <p class="text-xs text-yellow-500 mt-2">
              Redirecting to assessments list in {{ countdownSeconds }}s…
            </p>
          </div>
        </div>
      </Transition>

      <!-- Header -->
      <div v-if="selectedHcp || !isEditMode" class="mb-6">
        <div class="flex items-center space-x-3 mb-1">
          <button v-if="isEditMode && selectedHcp" @click="router.push('/assessments')"
            class="text-slate-400 hover:text-slate-600 transition-colors">
            <i class="pi pi-arrow-left"></i>
          </button>
          <h2 class="text-2xl font-bold text-slate-900">
            {{ isEditMode ? 'Edit Draft Assessment' : 'Request Assessment' }}
          </h2>
        </div>
        <p class="text-sm text-slate-600">
          {{ isEditMode
            ? `Editing draft for ${selectedHcp?.firstName || ''} ${selectedHcp?.lastName || ''}`
            : "Submit an HCP's CV for AI-powered FMV evaluation" }}
        </p>
      </div>

      <!-- Error / Success Messages -->
      <div v-if="formError" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
        <i class="pi pi-times-circle h-5 w-5 text-red-400 mt-0.5 mr-3 shrink-0"></i>
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <div v-if="formSuccess && !submissionBanner.show" class="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
        <i class="pi pi-check-circle h-5 w-5 text-green-400 mt-0.5 mr-3 shrink-0"></i>
        <p class="text-sm text-green-600">{{ formSuccess }}</p>
      </div>

      <!-- Submission Confirmation Banner -->
      <Transition name="slide-fade">
        <div v-if="submissionBanner.show" :class="[
          'mb-4 rounded-lg p-5 flex items-start shadow-sm border',
          submissionBanner.isError
            ? 'bg-gradient-to-r from-red-50 to-slate-50 border-red-200'
            : 'bg-gradient-to-r from-blue-50 to-slate-100 border-blue-200'
        ]">
          <i v-if="submissionBanner.isError" class="pi pi-times-circle h-6 w-6 text-red-500 mt-0.5 mr-3 shrink-0"></i>
          <i v-else class="pi pi-check-circle h-6 w-6 text-blue-500 mt-0.5 mr-3 shrink-0"></i>
          <div class="flex-1">
            <p :class="[
              'text-sm font-semibold mb-1',
              submissionBanner.isError ? 'text-red-900' : 'text-blue-900'
            ]">{{ submissionBanner.isError ? 'Submission Failed' : 'Assessment Submitted for AI Evaluation' }}</p>
            <p :class="[
              'text-sm',
              submissionBanner.isError ? 'text-red-700' : 'text-blue-700'
            ]">{{ submissionBanner.message }}</p>
            <p :class="[
              'text-xs mt-2',
              submissionBanner.isError ? 'text-red-500' : 'text-blue-500'
            ]">
              {{ submissionBanner.isError
                ? 'Redirecting to assessments list in ' + countdownSeconds + 's… (you can also go back and fix the issue)'
                : 'Redirecting to assessments list in ' + countdownSeconds + 's…' }}
            </p>
          </div>
        </div>
      </Transition>

      <!-- Form Steps -->
      <div class="space-y-6">
        <!-- Step 1: Select HCP -->
        <section class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">1</span>
            Select HCP
          </h3>

          <!-- HCP Search -->
          <div class="relative">
            <label for="hcp-search" class="block text-sm font-medium text-slate-700 mb-1">Search Healthcare Professional *</label>
            <input id="hcp-search" v-model="hcpSearchQuery" @focus="handleHcpInputFocus" @input="onHcpSearchInput"
              type="text" placeholder="Type at least 2 characters to search..."
              class="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

            <!-- HCP Suggestions Dropdown -->
            <div v-if="showHcpDropdown && hcpSuggestions.length > 0" class="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              <div v-for="hcp in hcpSuggestions" :key="hcp.id" @click="selectHcp(hcp)"
                class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-slate-900">{{ hcp.firstName }} {{ hcp.lastName }}</span>
                  <span v-if="hcp.state" class="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{{ hcp.state }}</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">
                  {{ hcp.email || 'No email' }} · {{ hcp.specialtyName || 'No specialty' }}
                </div>
              </div>
            </div>

            <button @click="showNewHcpForm = !showNewHcpForm" class="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
              + Create New HCP
            </button>
          </div>

          <!-- New HCP Form -->
          <Transition name="slide-fade">
            <div v-if="showNewHcpForm" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 class="text-sm font-semibold text-blue-900 mb-3">Create New Healthcare Professional</h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="new-hcp-first-name" class="block text-xs font-medium text-slate-700 mb-1">First Name *</label>
                  <input id="new-hcp-first-name" v-model="newHcpForm.firstName" type="text" required
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-last-name" class="block text-xs font-medium text-slate-700 mb-1">Last Name *</label>
                  <input id="new-hcp-last-name" v-model="newHcpForm.lastName" type="text" required
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-email" class="block text-xs font-medium text-slate-700 mb-1">Email</label>
                  <input id="new-hcp-email" v-model="newHcpForm.email" type="email"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-phone" class="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input id="new-hcp-phone" v-model="newHcpForm.phone" type="tel"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div class="sm:col-span-2">
                  <label for="new-hcp-address" class="block text-xs font-medium text-slate-700 mb-1">Address</label>
                  <input id="new-hcp-address" v-model="newHcpForm.address" type="text"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-city" class="block text-xs font-medium text-slate-700 mb-1">City</label>
                  <input id="new-hcp-city" v-model="newHcpForm.city" type="text"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-state" class="block text-xs font-medium text-slate-700 mb-1">State</label>
                  <input id="new-hcp-state" v-model="newHcpForm.state" type="text"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-country" class="block text-xs font-medium text-slate-700 mb-1">Country</label>
                  <input id="new-hcp-country" v-model="newHcpForm.country" type="text" placeholder="US"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <div>
                  <label for="new-hcp-specialty" class="block text-xs font-medium text-slate-700 mb-1">Specialty</label>
                  <select id="new-hcp-specialty" v-model="newHcpForm.specialtyId"
                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm form-select">
                    <option value="">Select specialty...</option>
                    <option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option>
                  </select>
                </div>
              </div>

              <div class="mt-4 flex space-x-3">
                <button @click="createNewHcp" :disabled="isCreatingHcp || !newHcpForm.firstName.trim() || !newHcpForm.lastName.trim()"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                  {{ isCreatingHcp ? 'Creating...' : 'Create HCP' }}
                </button>
                <button @click="showNewHcpForm = false" class="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
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
              <span class="text-slate-500">Email:</span><span class="text-slate-900">{{ selectedHcp.email || '—' }}</span>
              <span class="text-slate-500">Phone:</span><span class="text-slate-900">{{ selectedHcp.phone || '—' }}</span>
              <span class="text-slate-500">City:</span><span class="text-slate-900">{{ selectedHcp.city || '—' }}</span>
              <span class="text-slate-500">State/Country:</span><span class="text-slate-900">{{ [selectedHcp.state, selectedHcp.country].filter(Boolean).join(', ') || '—' }}</span>
              <span class="text-slate-500">Specialty:</span><span class="text-slate-900">{{ selectedHcp.specialtyName || '—' }}</span>
            </div>
          </div>

          <!-- Active Assessment Warning (Issue #35) -->
          <Transition name="slide-fade">
            <div v-if="showActiveWarning && selectedHcp" class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg shadow-sm">
              <div class="flex items-start">
                <i class="pi pi-exclamation-triangle h-5 w-5 text-amber-500 mt-0.5 mr-3 shrink-0"></i>
                <div class="flex-1">
                  <p class="text-sm font-semibold text-amber-900 mb-1">This HCP already has an active assessment</p>
                  <template v-if="activeAssessmentInfo.assessment">
                    <p class="text-xs text-amber-700 mb-3">
                      Current approval: <span class="font-medium">{{ activeAssessmentInfo.assessment.tierLabel || '—' }}</span>
                      · Score: {{ activeAssessmentInfo.assessment.totalScore ?? '—' }}
                      · Rate: ${{ activeAssessmentInfo.assessment.rate?.toFixed(2) ?? '—' }}
                    </p>
                  </template>
                  <p class="text-xs text-amber-600 mb-3">
                    Submitting a new assessment will supersede this approval once reviewed and approved.
                    The current rate remains valid until the new one is officially approved.
                  </p>
                  <div class="flex items-center space-x-3">
                    <button @click="router.push(`/hcp/${selectedHcp.id}/profile`); clearActiveWarning()"
                      class="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium transition-colors">
                      View Profile
                    </button>
                    <button @click="clearActiveWarning()"
                      class="px-3 py-1.5 border border-amber-400 bg-white text-amber-800 rounded-lg hover:bg-amber-50 text-xs font-medium transition-colors">
                      Continue — Re-assess
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </section>

        <!-- Step 2: Edit Contact Info -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">2</span>
            Contact Information (editable)
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="edit-email" class="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input id="edit-email" v-model="editEmail" type="email" placeholder="hcp@example.com"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-phone" class="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input id="edit-phone" v-model="editPhone" type="tel" placeholder="(555) 123-4567"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div class="sm:col-span-2">
              <label for="edit-address" class="block text-sm font-medium text-slate-700 mb-1">Address</label>
              <input id="edit-address" v-model="editAddress" type="text" placeholder="Street address"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-city" class="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input id="edit-city" v-model="editCity" type="text" placeholder="e.g., Los Angeles"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-state" class="block text-sm font-medium text-slate-700 mb-1">State</label>
              <input id="edit-state" v-model="editState" type="text" placeholder="e.g., CA, NY"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="edit-country" class="block text-sm font-medium text-slate-700 mb-1">Country</label>
              <input id="edit-country" v-model="editCountry" type="text" placeholder="US"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>

          <p class="mt-3 text-xs text-slate-500">Changes to contact info will be saved to the HCP master record.</p>
        </section>

        <!-- Step 3: Assessment Details -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">3</span>
            Assessment Details
          </h3>

          <div class="space-y-4">
            <div>
              <label for="specialty" class="block text-sm font-medium text-slate-700 mb-1">Specialty</label>
              <select id="specialty" v-model="specialtyId"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent form-select">
                <option value="">Select specialty...</option>
                <option v-for="s in specialties" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <!-- Auto-resolved criteria set (read-only hint) -->
            <div v-if="criteriaSetId" class="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p class="text-xs font-medium text-blue-700">Criteria Set</p>
              <p class="text-sm text-blue-900">{{ specialties.find(s => s.id === specialtyId)?.name ? 'Auto-resolved from specialty' : '' }}</p>
            </div>

            <div>
              <label for="context" class="block text-sm font-medium text-slate-700 mb-1">Additional Context (optional)</label>
              <textarea id="context" v-model="additionalContext" rows="3" placeholder="Any additional notes about this assessment request..."
                class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
            </div>
          </div>
        </section>

        <!-- Step 4: CV Upload -->
        <section v-if="selectedHcp" class="bg-white shadow rounded-lg p-6">
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-sm font-bold mr-3">4</span>
            Upload CV / Resume (PDF) *
          </h3>

          <!-- File Input -->
          <div v-if="!cvFileName" class="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            <input id="cv-upload" type="file" accept=".pdf,application/pdf" @change="handleCvFileChange" class="hidden" />
            <label for="cv-upload" class="cursor-pointer">
              <i class="pi pi-upload mx-auto h-12 w-12 text-slate-400"></i>
              <p class="mt-2 text-sm font-medium text-slate-900">Click to upload or drag and drop</p>
              <p class="text-xs text-slate-500 mt-1">PDF files only, max 10MB</p>
            </label>
          </div>

          <!-- File Selected -->
          <div v-else-if="!isUploadingCv && !cvUploaded" class="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div class="flex items-center space-x-3">
              <i class="pi pi-file-pdf h-8 w-8 text-red-500"></i>
              <div>
                <p class="text-sm font-medium text-slate-900">{{ cvFileName }}</p>
                <p class="text-xs text-slate-500">{{ (cvFile!.size / 1024).toFixed(1) }} KB</p>
              </div>
            </div>
            <button @click="resetCvUpload" class="text-sm text-red-600 hover:text-red-800">Remove</button>
          </div>

          <!-- Upload Progress -->
          <div v-if="isUploadingCv" class="space-y-3">
            <div class="flex items-center justify-between text-sm">
              <span class="text-slate-700">{{ cvUploadProgress < 50 ? 'Creating assessment...' : 'Extracting CV text...' }}</span>
              <span class="font-medium text-blue-600">{{ cvUploadProgress }}%</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-2.5">
              <div class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" :style="{ width: cvUploadProgress + '%' }"></div>
            </div>
          </div>

          <!-- Upload Success -->
          <div v-if="cvUploaded" class="flex items-center space-x-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <i class="pi pi-check-circle h-6 w-6 text-green-500"></i>
            <div>
              <p class="text-sm font-medium text-green-900">CV uploaded successfully</p>
              <p class="text-xs text-green-700">{{ cvTextLength }} characters extracted from PDF</p>
            </div>
          </div>

          <!-- Upload Button -->
          <button v-if="cvFileName && !isUploadingCv && !cvUploaded" @click="uploadCv"
            class="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium transition-colors">
            Upload & Extract Text
          </button>
        </section>

        <!-- Submit Button -->
        <div v-if="selectedHcp && cvUploaded" class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-slate-900">Ready to submit</p>
              <p class="text-xs text-slate-500">The AI will evaluate the CV against your criteria set. This may take several minutes.</p>
            </div>
            <button @click="handleSubmit" :disabled="!canSubmit || isSubmitting"
              :class="['px-8 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm font-medium transition-colors flex items-center space-x-2',
                isSubmitting
                  ? 'bg-green-700 text-white cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed']">
              <svg v-if="isSubmitting" class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ isSubmitting ? 'Submitting for AI Processing...' : 'Submit for AI Processing' }}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.slide-fade-enter-active, .slide-fade-leave-active { transition: all 0.3s ease; }
.slide-fade-enter-from, .slide-fade-leave-to { opacity: 0; transform: translateY(-10px); }
</style>
