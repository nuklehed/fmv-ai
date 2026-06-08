<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import * as assessmentDomain from '@/domain/assessment'

const router = useRouter()
const route = useRoute()

// ─── State ──────────────────────────────────────────────────────

interface AssessmentWithCriteriaSet extends assessmentDomain.AssessmentListItem {
  criteriaSet?: any
}

const assessment = ref<AssessmentWithCriteriaSet | null>(null)
const loading = ref(true)
const savingReview = ref(false)
const savingApprove = ref(false)
const formError = ref('')
const successMessage = ref('')

// Review mode: false = Phase 1 (read-only), true = Phase 2 (editable + approve)
const isReviewing = ref(false)

// Override state per question
interface OverrideEntry {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

const overrides = ref<OverrideEntry[]>([])

// Tier/rate state
const availableTiers = ref<Array<{ id: string; name: string; lowRate: number; highRate: number }>>([])
const approveTierId = ref('')
const approveRateOverride = ref('')
const approveRationale = ref('')

// ─── Computed ──────────────────────────────────────────────────

/** AI's original total score — look up scores from criteria set since stored AI results don't include a score field */
const aiScore = computed(() => {
  if (!assessment.value?.criteriaSet || !assessment.value.aiResults) return null
  const results = assessmentDomain.getAiResults(assessment.value)
  let score = 0
  for (const r of results) {
    const question = assessment.value!.criteriaSet.questions.find((q: any) => q.id === r.questionId)
    if (question) {
      const answer = question.answers.find((a: any) => a.id === r.selectedAnswerId)
      if (answer) score += answer.score
    }
  }
  return score
})

/** Admin's selected total score — computed from overrides */
const adminScore = computed(() => {
  if (!assessment.value?.criteriaSet || overrides.value.length === 0) return null
  let score = 0
  for (const o of overrides.value) {
    const question = assessment.value!.criteriaSet?.questions.find((q: any) => q.id === o.questionId)
    if (question) {
      const answer = question.answers.find((a: any) => a.id === o.selectedAnswerId)
      if (answer) score += answer.score
    }
  }
  return score
})

/** Zero-score flag — prevents auto-approval, requires manual review */
const isZeroScore = computed(() => adminScore.value !== null && adminScore.value === 0)

/** Handle answer change — clear rationale when reverting to AI's choice */
function onAnswerChange(_questionId: string, index: number): void {
  const aiResults = assessment.value?.aiResults ? JSON.parse(assessment.value.aiResults as string) : []
  const aiAnswerId = aiResults[index]?.selectedAnswerId
  if (overrides.value[index].selectedAnswerId === aiAnswerId) {
    overrides.value[index].rationale = ''
  }
}

// ─── Helpers ───────────────────────────────────────────────────

function getAiRationale(questionId: string): string {
  const results = assessmentDomain.getAiResults(assessment.value!)
  const result = results.find((r: any) => r.questionId === questionId)
  return result?.rationale || ''
}

function isAnswerSameAsAI(questionId: string, answerId: string): boolean {
  const results = assessmentDomain.getAiResults(assessment.value!)
  const result = results.find((r: any) => r.questionId === questionId)
  return result?.selectedAnswerId === answerId
}

// ─── API Operations ────────────────────────────────────────────

async function fetchAssessment() {
  loading.value = true
  try {
    const id = route.params.id as string
    const result = await assessmentDomain.fetchAssessment(id)
    assessment.value = result as unknown as assessmentDomain.AssessmentListItem

    // If already in UNDER_REVIEW, skip straight to Phase 2 and restore overrides from AI results
    if (assessment.value.status === 'UNDER_REVIEW') {
      isReviewing.value = true
      const aiResults = assessmentDomain.getAiResults(assessment.value)
      const aiByQuestionId = new Map(aiResults.map((r: any) => [r.questionId, r]))
      const questions = assessment.value.criteriaSet?.questions || []
      // Build overrides for ALL questions — use AI result as default when available
      overrides.value = questions.map((q: any) => {
        const ai = aiByQuestionId.get(q.id)
        return ai ? { questionId: q.id, selectedAnswerId: ai.selectedAnswerId, rationale: '' } : { questionId: q.id, selectedAnswerId: '', rationale: '' }
      })
    }

    await loadTiers()
  } catch {
    formError.value = 'Failed to load assessment'
  } finally {
    loading.value = false
  }
}

async function loadTiers() {
  try {
    const specialtyId = assessment.value?.specialtyId || undefined
    availableTiers.value = await assessmentDomain.fetchTiers(specialtyId)
  } catch { /* silent */ }
}

/** Phase 1 → Phase 2: Start Review (AI_COMPLETE → UNDER_REVIEW) */
async function startReview() {
  if (!assessment.value) return
  savingReview.value = true
  formError.value = ''

  try {
    const aiResults = assessmentDomain.getAiResults(assessment.value)
    const aiByQuestionId = new Map(aiResults.map((r: any) => [r.questionId, r]))
    const questions = assessment.value.criteriaSet?.questions || []
    // Initialize overrides for EVERY question — use AI result as default when available
    overrides.value = questions.map((q: any) => {
      const ai = aiByQuestionId.get(q.id)
      return ai ? { questionId: q.id, selectedAnswerId: ai.selectedAnswerId, rationale: '' } : { questionId: q.id, selectedAnswerId: '', rationale: '' }
    })

    // Call backend to transition status to UNDER_REVIEW
    await assessmentDomain.startReview(assessment.value.id)
    isReviewing.value = true
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to start review'
  } finally {
    savingReview.value = false
  }
}

/** Phase 2: Save Review + Approve (UNDER_REVIEW → APPROVED) */
async function saveAndApprove() {
  if (!assessment.value) return
  savingApprove.value = true
  formError.value = ''

  // Zero-score requires manual rationale
  if (isZeroScore.value && !approveRationale.value.trim()) {
    formError.value = 'Zero-score assessments require an approval rationale'
    savingApprove.value = false
    return
  }

  try {
    await assessmentDomain.approveAssessment(assessment.value.id, {
      tierId: approveTierId.value || null,
      rateOverride: approveRateOverride.value ? parseFloat(approveRateOverride.value) : null,
      rationale: approveRationale.value || null
    })
    successMessage.value = 'Review saved — assessment approved'
    setTimeout(() => router.push('/assessments'), 2000)
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to save review'
  } finally {
    savingApprove.value = false
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────

onMounted(() => { fetchAssessment() })
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4">
      <div class="max-w-[96rem] mx-auto flex items-center justify-between">
        <div>
          <router-link to="/assessments" class="text-sm text-blue-600 hover:text-blue-800 mb-1 inline-block">← Back to Assessments</router-link>
          <h1 v-if="assessment" class="text-xl font-bold text-gray-900">
            Review Assessment — {{ assessment.hcp.firstName }} {{ assessment.hcp.lastName }}
          </h1>
        </div>
        <span :class="['inline-flex items-center px-3 py-1 rounded-full text-sm font-medium', assessmentDomain.getStatusColor(assessment?.status || '')]">
          {{ assessment ? assessmentDomain.getStatusLabel(assessment.status) : '' }}
        </span>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-[96rem] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- Messages -->
      <div v-if="successMessage" class="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
        <p class="text-sm text-green-700">{{ successMessage }}</p>
      </div>
      <div v-if="formError && !loading" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-gray-500">Loading assessment...</p>
      </div>

      <!-- Phase 1: Read-only AI Results (before clicking Start Review) -->
      <div v-else-if="assessment && !isReviewing" class="space-y-6">
        <!-- Score Banner -->
        <div class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">AI Evaluation Results</h2>
          <div class="flex items-center space-x-8">
            <div>
              <p class="text-sm text-gray-500">AI Total Score</p>
              <p class="text-3xl font-bold text-purple-700">{{ aiScore ?? '—' }}</p>
            </div>
          </div>
        </div>

        <!-- AI Results Cards -->
        <div v-if="assessment.criteriaSet?.questions" class="space-y-4">
          <div v-for="(question, index) in assessment.criteriaSet.questions" :key="question.id" class="bg-white shadow rounded-lg p-6">
            <h3 class="text-base font-medium text-gray-900 mb-3">{{ `Q${index + 1}: ${question.text}` }}</h3>

            <!-- AI's Selection -->
            <div v-if="assessment.aiResults" class="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div class="flex items-start space-x-3">
                <svg class="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" /></svg>
                <div class="flex-1">
                  <p class="text-sm font-medium text-purple-900 mb-1">AI Selected: {{ getAiAnswerText(question, assessment) }}</p>
                  <p class="text-xs text-purple-700">{{ getAiScore(question, assessment) }} pts</p>
                  <p v-if="getAiRationale(question.id)" class="text-xs text-gray-600 mt-2 italic">"{{ getAiRationale(question.id) }}"</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Start Review Button -->
        <div class="flex justify-center pt-4">
          <button
            @click="startReview"
            :disabled="savingReview"
            class="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {{ savingReview ? 'Starting...' : 'Start Review' }}
          </button>
        </div>
      </div>

      <!-- Phase 2: Editable + Approve (after clicking Start Review) -->
      <div v-else-if="assessment && isReviewing" class="space-y-6">
        <!-- Score Banner -->
        <div class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-gray-900 mb-4">Review & Approve</h2>
          <div class="flex items-center space-x-8">
            <div>
              <p class="text-sm text-gray-500">AI Score</p>
              <p class="text-3xl font-bold text-purple-700">{{ aiScore ?? '—' }}</p>
            </div>
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div>
              <p class="text-sm text-gray-500">Admin Score</p>
              <p class="text-3xl font-bold text-blue-700">{{ adminScore ?? '—' }}</p>
            </div>
          </div>
        </div>

        <!-- Question Cards (Editable) -->
        <div v-if="assessment.criteriaSet?.questions" class="space-y-4">
          <div v-for="(question, index) in assessment.criteriaSet.questions" :key="question.id" class="bg-white shadow rounded-lg p-6">
            <h3 class="text-base font-medium text-gray-900 mb-3">{{ `Q${index + 1}: ${question.text}` }}</h3>

            <!-- AI's Selection (read-only) -->
            <div v-if="assessment.aiResults" class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <div class="flex items-start space-x-3">
                <svg class="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" /></svg>
                <div class="flex-1">
                  <p class="text-sm font-medium text-purple-900 mb-1">AI Selected: {{ getAiAnswerText(question, assessment) }}</p>
                  <p class="text-xs text-purple-700">{{ getAiScore(question, assessment) }} pts</p>
                  <p v-if="getAiRationale(question.id)" class="text-xs text-gray-600 mt-2 italic">"{{ getAiRationale(question.id) }}"</p>
                </div>
              </div>
            </div>

            <!-- Admin Selection -->
            <div>
              <label :for="`answer-${question.id}`" class="block text-sm font-medium text-gray-700 mb-1">Your Answer</label>
              <select
                :id="`answer-${question.id}`"
                v-model="overrides[index].selectedAnswerId"
                @change="onAnswerChange(question.id, index)"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select answer...</option>
                <option v-for="answer in getSortedAnswers(question.answers)" :key="answer.id" :value="answer.id">
                  {{ answer.text }} ({{ answer.score }} pts)
                  <span v-if="isAnswerSameAsAI(question.id, answer.id)" class="text-gray-400 text-xs"> ← AI choice</span>
                </option>
              </select>
            </div>

            <!-- Admin Rationale (shown when different from AI's choice) -->
            <div v-if="overrides[index].selectedAnswerId && !isAnswerSameAsAI(question.id, overrides[index].selectedAnswerId)" class="mt-3">
              <label :for="`rationale-${question.id}`" class="block text-sm font-medium text-gray-700 mb-1">Rationale (optional)</label>
              <input
                :id="`rationale-${question.id}`"
                v-model="overrides[index].rationale"
                type="text"
                placeholder="Why this answer?"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <!-- Tier & Rate Section -->
        <div class="bg-white shadow rounded-lg p-6">
          <h3 class="text-base font-medium text-gray-900 mb-4">Tier & Rate</h3>

          <!-- Zero-score warning -->
          <div v-if="isZeroScore" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
            <svg class="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
            <div>
              <p class="text-sm font-semibold text-red-900">Manual Review Required</p>
              <p class="text-xs text-red-700 mt-1">Score is zero — auto-approval is disabled. Please provide a rationale before approving.</p>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label for="approve-tier" class="block text-sm font-medium text-gray-700 mb-1">Tier</label>
              <select id="approve-tier" v-model="approveTierId" :disabled="isZeroScore"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">Auto-assign based on score</option>
                <option v-for="tier in availableTiers" :key="tier.id" :value="tier.id">{{ tier.name }} ({{ tier.lowRate }} - {{ tier.highRate }})</option>
              </select>
              <p v-if="isZeroScore" class="text-xs text-red-600 mt-1">Tier auto-assign disabled for zero-score assessments</p>
            </div>

            <div>
              <label for="rate-override" class="block text-sm font-medium text-gray-700 mb-1">Rate Override (optional)</label>
              <input id="rate-override" v-model="approveRateOverride" type="number" step="0.01" placeholder="Override calculated rate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>

            <div>
              <label for="approve-rationale" class="block text-sm font-medium text-gray-700 mb-1">Approval Rationale (optional)</label>
              <textarea id="approve-rationale" v-model="approveRationale" rows="2" placeholder="Explain approval decision..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-between items-center pt-4">
          <router-link to="/assessments" class="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">Cancel</router-link>
          <button
            @click="saveAndApprove"
            :disabled="savingApprove || !adminScore"
            class="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {{ savingApprove ? 'Saving...' : 'Save Review & Approve' }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
// Helper functions for template use
function getAiAnswerText(question: any, assessment: any): string {
  if (!assessment.aiResults) return '—'
  const results = JSON.parse(assessment.aiResults as string)
  const result = results.find((r: any) => r.questionId === question.id)
  if (!result) return '—'

  // Find the answer text from criteria set
  const answers = question.answers || []
  const answer = answers.find((a: any) => a.id === result.selectedAnswerId)
  return answer?.text || '—'
}

function getAiScore(question: any, assessment: any): number {
  if (!assessment.aiResults) return 0
  const results = JSON.parse(assessment.aiResults as string)
  const result = results.find((r: any) => r.questionId === question.id)
  if (!result) return 0

  const answers = question.answers || []
  const answer = answers.find((a: any) => a.id === result.selectedAnswerId)
  return answer?.score ?? 0
}

function getSortedAnswers(answers: any[]): any[] {
  return [...(answers || [])].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
}
</script>
