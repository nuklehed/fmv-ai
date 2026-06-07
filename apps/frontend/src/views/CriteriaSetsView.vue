<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAuthHeaders, apiFetch } from '@/composables/useCrud'

interface Answer {
  id: string; text: string; score: number; order: number; isActive: boolean
}
interface Question {
  id: string; text: string; order: number; isActive: boolean; answers: Answer[]
}
interface CriteriaSet {
  id: string; name: string; description?: string | null; systemPrompt?: string | null
  isActive: boolean; tenantId: string; createdAt: string; updatedAt: string; questions: Question[]
}

const criteriaSets = ref<CriteriaSet[]>([])
const loading = ref(false)
const searchQuery = ref('')
const formError = ref('')

// Modal states
const showAddModal = ref(false)
const showEditModal = ref(false)
const showPromptModal = ref(false)
const editingItem = ref<CriteriaSet | null>(null)

// Form state for criteria set add/edit
const formName = ref('')
const formDescription = ref('')

// Form state for system prompt (SA-only)
const currentSystemPrompt = ref('')
const newSystemPrompt = ref('')

// Question/Answer modal states
const showAddQuestionModal = ref(false)
const showEditQuestionModal = ref(false)
const showAddAnswerModal = ref(false)
const showEditAnswerModal = ref(false)
const activeCriteriaSetId = ref<string | null>(null)
const activeQuestionIdForEdit = ref<string | null>(null)

// Question form state
const questionText = ref('')
const questionOrder = ref<number>()

// Answer form state
const answerText = ref('')
const answerScore = ref(0)
const answerOrder = ref<number>()
const activeQuestionId = ref<string | null>(null)
const activeAnswerIdForEdit = ref<string | null>(null)

// Expand/collapse state for tree view
const expandedSets = ref<Set<string>>(new Set())

function toggleExpand(id: string) {
  if (expandedSets.value.has(id)) {
    expandedSets.value.delete(id)
  } else {
    expandedSets.value.add(id)
  }
}

async function fetchCriteriaSets() {
  loading.value = true
  try {
    criteriaSets.value = await (await apiFetch(
      `/api/criteria-sets?active=true&search=${encodeURIComponent(searchQuery.value)}`,
      { headers: getAuthHeaders() }
    )).json()
  } catch { formError.value = 'Failed to load criteria sets' }
  finally { loading.value = false }
}

function resetForm() {
  formName.value = ''
  formDescription.value = ''
  questionText.value = ''
  answerText.value = ''
  answerScore.value = 0
  formError.value = ''
}

// ─── Criteria Set CRUD ──────────────────────────────────────────────

async function handleAdd() {
  if (!formName.value.trim()) { formError.value = 'Criteria set name is required'; return }
  try {
    await apiFetch('/api/criteria-sets', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, description: formDescription.value || null })
    })
    showAddModal.value = false; resetForm(); await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to create criteria set' }
}

async function openEditModal(cs: CriteriaSet) {
  editingItem.value = cs
  formName.value = cs.name
  formDescription.value = cs.description || ''
  formError.value = ''
  showEditModal.value = true
}

async function handleUpdate() {
  if (!editingItem.value || !formName.value.trim()) { formError.value = 'Criteria set name is required'; return }
  try {
    await apiFetch(`/api/criteria-sets/${editingItem.value.id}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ name: formName.value, description: formDescription.value || null })
    })
    showEditModal.value = false; resetForm(); editingItem.value = null; await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to update criteria set' }
}

async function openPromptModal(cs: CriteriaSet) {
  editingItem.value = cs
  currentSystemPrompt.value = cs.systemPrompt || ''
  newSystemPrompt.value = cs.systemPrompt || ''
  formError.value = ''
  showPromptModal.value = true
}

async function handleUpdatePrompt() {
  if (!editingItem.value) return
  try {
    await apiFetch(`/api/criteria-sets/${editingItem.value.id}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ systemPrompt: newSystemPrompt.value || null })
    })
    showPromptModal.value = false; editingItem.value = null; await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to update system prompt' }
}

async function handleDeactivate(cs: CriteriaSet) {
  if (!confirm(`Are you sure you want to deactivate "${cs.name}"?`)) return
  try {
    await apiFetch(`/api/criteria-sets/${cs.id}`, { method: 'DELETE', headers: getAuthHeaders() })
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to deactivate criteria set' }
}

// ─── Question CRUD ──────────────────────────────────────────────────

async function openAddQuestionModal(csId: string) {
  activeCriteriaSetId.value = csId
  questionText.value = ''
  questionOrder.value = undefined
  formError.value = ''
  showAddQuestionModal.value = true
}

async function handleAddQuestion() {
  if (!activeCriteriaSetId.value || !questionText.value.trim()) { formError.value = 'Question text is required'; return }
  try {
    await apiFetch(`/api/criteria-sets/${activeCriteriaSetId.value}/questions`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ text: questionText.value, order: questionOrder.value })
    })
    showAddQuestionModal.value = false; resetForm(); await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to create question' }
}

async function openEditQuestionModal(question: Question, csId: string) {
  activeCriteriaSetId.value = csId
  activeQuestionIdForEdit.value = question.id
  questionText.value = question.text
  questionOrder.value = question.order
  formError.value = ''
  showEditQuestionModal.value = true
}

async function handleUpdateQuestion() {
  if (!activeCriteriaSetId.value || !activeQuestionIdForEdit.value || !questionText.value.trim()) { formError.value = 'Question text is required'; return }
  try {
    await apiFetch(`/api/criteria-sets/${activeCriteriaSetId.value}/questions/${activeQuestionIdForEdit.value}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ text: questionText.value, order: questionOrder.value })
    })
    showEditQuestionModal.value = false; resetForm()
    activeCriteriaSetId.value = null; activeQuestionIdForEdit.value = null
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to update question' }
}

async function handleDeleteQuestion(csId: string, questionId: string) {
  if (!confirm(`Are you sure you want to delete this question?`)) return
  try {
    await apiFetch(`/api/criteria-sets/${csId}/questions/${questionId}`, { method: 'DELETE', headers: getAuthHeaders() })
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to delete question' }
}

// ─── Answer CRUD ────────────────────────────────────────────────────

async function openAddAnswerModal(questionId: string, csId: string) {
  activeQuestionId.value = questionId
  activeCriteriaSetId.value = csId
  answerText.value = ''
  answerScore.value = 0
  answerOrder.value = undefined
  formError.value = ''
  showAddAnswerModal.value = true
}

async function handleAddAnswer() {
  if (!activeQuestionId.value || !answerText.value.trim()) { formError.value = 'Answer text is required'; return }
  if (answerScore.value < 0) { formError.value = 'Score must be a non-negative integer'; return }
  try {
    await apiFetch(`/api/criteria-sets/${activeCriteriaSetId.value}/questions/${activeQuestionId.value}/answers`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ text: answerText.value, score: answerScore.value, order: answerOrder.value })
    })
    showAddAnswerModal.value = false; resetForm()
    activeQuestionId.value = null; activeCriteriaSetId.value = null
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to create answer' }
}

async function openEditAnswerModal(answer: Answer, questionId: string, csId: string) {
  activeQuestionId.value = questionId
  activeCriteriaSetId.value = csId
  activeAnswerIdForEdit.value = answer.id
  answerText.value = answer.text
  answerScore.value = answer.score
  answerOrder.value = answer.order
  formError.value = ''
  showEditAnswerModal.value = true
}

async function handleUpdateAnswer() {
  if (!activeQuestionId.value || !activeAnswerIdForEdit.value || !answerText.value.trim()) { formError.value = 'Answer text is required'; return }
  if (answerScore.value < 0) { formError.value = 'Score must be a non-negative integer'; return }
  try {
    await apiFetch(`/api/criteria-sets/${activeCriteriaSetId.value}/questions/${activeQuestionId.value}/answers/${activeAnswerIdForEdit.value}`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ text: answerText.value, score: answerScore.value })
    })
    showEditAnswerModal.value = false; resetForm()
    activeQuestionId.value = null; activeAnswerIdForEdit.value = null; activeCriteriaSetId.value = null
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to update answer' }
}

async function handleDeleteAnswer(csId: string, questionId: string, answerId: string) {
  if (!confirm(`Are you sure you want to delete this answer?`)) return
  try {
    await apiFetch(`/api/criteria-sets/${csId}/questions/${questionId}/answers/${answerId}`, { method: 'DELETE', headers: getAuthHeaders() })
    await fetchCriteriaSets()
  } catch (error) { formError.value = error instanceof Error ? error.message : 'Failed to delete answer' }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => fetchCriteriaSets(), 300)
}

onMounted(() => {
  fetchCriteriaSets()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">Criteria Sets Management</h2>
          <p class="text-sm text-gray-600">Manage evaluation criteria for AI assessment (Admin/Superadmin)</p>
        </div>
        <button
          @click="showAddModal = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm font-medium"
        >
          Add Criteria Set
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

      <!-- Error Message -->
      <div v-if="formError && !showAddModal && !showEditModal && !showPromptModal" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading criteria sets...</p>
      </div>

      <!-- Tree View -->
      <div v-if="!loading" class="space-y-4">
        <div v-for="cs in criteriaSets" :key="cs.id" class="bg-white shadow rounded-lg overflow-hidden">
          <!-- Criteria Set Header -->
          <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div class="flex items-center space-x-3">
              <button @click="toggleExpand(cs.id)" class="text-gray-500 hover:text-gray-700">
                <!-- Expand/Collapse icon -->
                <svg v-if="!expandedSets.has(cs.id)" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <span class="text-lg font-semibold text-gray-900">{{ cs.name }}</span>
              <span :class="[
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                cs.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              ]">
                {{ cs.isActive ? 'Active' : 'Inactive' }}
              </span>
              <span class="text-sm text-gray-500">{{ cs.questions.length }} question{{ cs.questions.length !== 1 ? 's' : '' }}</span>
            </div>
            <div class="flex items-center space-x-2">
              <!-- System Prompt button (SA-only) -->
              <button @click="openPromptModal(cs)" class="text-purple-600 hover:text-purple-900 text-sm" title="Edit system prompt (SA only)">
                ⚙️ Prompt
              </button>
              <span>|</span>
              <button @click="openEditModal(cs)" class="text-blue-600 hover:text-blue-900 text-sm">Edit</button>
              <span v-if="cs.isActive">|</span>
              <button v-if="cs.isActive" @click="handleDeactivate(cs)" class="text-red-600 hover:text-red-900 text-sm">Deactivate</button>
            </div>
          </div>

          <!-- Description -->
          <div v-if="cs.description" class="px-6 py-2 bg-gray-50 border-b border-gray-100">
            <p class="text-sm text-gray-600">{{ cs.description }}</p>
          </div>

          <!-- Questions Tree (expanded) -->
          <Transition name="expand">
            <div v-if="expandedSets.has(cs.id)" class="px-6 py-4 space-y-3">
              <button
                @click="openAddQuestionModal(cs.id)"
                class="text-sm text-blue-600 hover:text-blue-900 font-medium"
              >
                + Add Question
              </button>

              <div v-if="cs.questions.length === 0" class="text-sm text-gray-400 italic pl-4">
                No questions yet. Click "Add Question" to create one.
              </div>

              <!-- Questions -->
              <div v-for="question in cs.questions" :key="question.id" class="border border-gray-200 rounded-lg p-4 ml-4">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1">
                    <p class="text-sm font-medium text-gray-900">{{ question.text }}</p>
                    <span class="text-xs text-gray-500">Order: {{ question.order }}</span>
                  </div>
                  <div class="flex items-center space-x-2 ml-4">
                    <button @click="openEditQuestionModal(question, cs.id)" class="text-blue-600 hover:text-blue-900 text-xs">Edit</button>
                    <span>|</span>
                    <button @click="handleDeleteQuestion(cs.id, question.id)" class="text-red-600 hover:text-red-900 text-xs">Delete</button>
                  </div>
                </div>

                <!-- Answers -->
                <div class="ml-4 space-y-2">
                  <button
                    @click="openAddAnswerModal(question.id, cs.id)"
                    class="text-xs text-blue-600 hover:text-blue-900 font-medium"
                  >
                    + Add Answer
                  </button>

                  <div v-if="question.answers.length === 0" class="text-xs text-gray-400 italic pl-2">
                    No answers yet. Click "Add Answer" to create one.
                  </div>

                  <!-- Answer items -->
                  <div v-for="answer in question.answers" :key="answer.id" class="flex items-center justify-between bg-gray-50 rounded px-3 py-2 ml-2">
                    <div class="flex items-center space-x-3 flex-1">
                      <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{{ answer.score }}</span>
                      <span class="text-sm text-gray-700">{{ answer.text }}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                      <button @click="openEditAnswerModal(answer, question.id, cs.id)" class="text-blue-600 hover:text-blue-900 text-xs">Edit</button>
                      <span>|</span>
                      <button @click="handleDeleteAnswer(cs.id, question.id, answer.id)" class="text-red-600 hover:text-red-900 text-xs">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Empty State -->
        <div v-if="criteriaSets.length === 0" class="bg-white shadow rounded-lg p-8 text-center">
          <p class="text-sm text-gray-500 mb-2">No criteria sets found.</p>
          <p class="text-xs text-gray-400">Click "Add Criteria Set" to create one.</p>
        </div>
      </div>

      <!-- ─── Modals ──────────────────────────────────────────────── -->

      <!-- Add Criteria Set Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add New Criteria Set</h3>
                  <form @submit.prevent="handleAdd" class="space-y-4">
                    <div>
                      <label for="add-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input id="add-name" v-model="formName" type="text" required placeholder="e.g., Prescriber Evaluation" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="add-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea id="add-description" v-model="formDescription" rows="3" placeholder="Optional description..." class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
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

      <!-- Edit Criteria Set Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Criteria Set</h3>
                  <form @submit.prevent="handleUpdate" class="space-y-4">
                    <div>
                      <label for="edit-name" class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input id="edit-name" v-model="formName" type="text" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="edit-description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea id="edit-description" v-model="formDescription" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleUpdate" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Save Changes</button>
                  <button @click="showEditModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- System Prompt Modal (SA-only) -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showPromptModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showPromptModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-1">Edit System Prompt</h3>
                  <p class="text-xs text-purple-600 mb-4">⚠️ SA-only — Misconfiguration affects all downstream scoring</p>
                  <form @submit.prevent="handleUpdatePrompt" class="space-y-4">
                    <div>
                      <label for="prompt-text" class="block text-sm font-medium text-gray-700 mb-1">System Prompt *</label>
                      <textarea id="prompt-text" v-model="newSystemPrompt" rows="8" placeholder="Enter the system prompt that guides AI evaluation..." class="w-full px-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleUpdatePrompt" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-purple-600 text-base font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:ml-3 sm:w-auto sm:text-sm">Save Prompt</button>
                  <button @click="showPromptModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Add Question Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddQuestionModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddQuestionModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add Question</h3>
                  <form @submit.prevent="handleAddQuestion" class="space-y-4">
                    <div>
                      <label for="q-text" class="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
                      <textarea id="q-text" v-model="questionText" rows="3" required placeholder="e.g., How many years of clinical experience does this HCP have?" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="q-order" class="block text-sm font-medium text-gray-700 mb-1">Order (optional)</label>
                      <input id="q-order" v-model.number="questionOrder" type="number" min="0" placeholder="Leave blank to append at end" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleAddQuestion" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Add Question</button>
                  <button @click="showAddQuestionModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Edit Question Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditQuestionModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditQuestionModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Question</h3>
                  <form @submit.prevent="handleUpdateQuestion" class="space-y-4">
                    <div>
                      <label for="eq-text" class="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
                      <textarea id="eq-text" v-model="questionText" rows="3" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="eq-order" class="block text-sm font-medium text-gray-700 mb-1">Order</label>
                      <input id="eq-order" v-model.number="questionOrder" type="number" min="0" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleUpdateQuestion" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Save Changes</button>
                  <button @click="showEditQuestionModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Add Answer Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showAddAnswerModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showAddAnswerModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Add Answer</h3>
                  <form @submit.prevent="handleAddAnswer" class="space-y-4">
                    <div>
                      <label for="a-text" class="block text-sm font-medium text-gray-700 mb-1">Answer Text *</label>
                      <textarea id="a-text" v-model="answerText" rows="3" required placeholder="e.g., 1-5 years of clinical experience" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="a-score" class="block text-sm font-medium text-gray-700 mb-1">Score *</label>
                      <input id="a-score" v-model.number="answerScore" type="number" min="0" required placeholder="e.g., 1" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleAddAnswer" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Add Answer</button>
                  <button @click="showAddAnswerModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- Edit Answer Modal -->
      <Teleport to="body">
        <Transition name="modal">
          <div v-if="showEditAnswerModal" class="fixed inset-0 z-50 overflow-y-auto">
            <div class="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" @click="showEditAnswerModal = false" />
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-4">Edit Answer</h3>
                  <form @submit.prevent="handleUpdateAnswer" class="space-y-4">
                    <div>
                      <label for="ea-text" class="block text-sm font-medium text-gray-700 mb-1">Answer Text *</label>
                      <textarea id="ea-text" v-model="answerText" rows="3" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label for="ea-score" class="block text-sm font-medium text-gray-700 mb-1">Score *</label>
                      <input id="ea-score" v-model.number="answerScore" type="number" min="0" required class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
                  </form>
                </div>
                <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button @click="handleUpdateAnswer" type="button" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm">Save Changes</button>
                  <button @click="showEditAnswerModal = false" type="button" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">Cancel</button>
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

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  max-height: 500px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
