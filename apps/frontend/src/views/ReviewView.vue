<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useRouter, useRoute } from 'vue-router'
import * as assessmentDomain from '@/domain/assessment'

const router = useRouter()
const route = useRoute()
const toast = useToast()

// ─── State ──────────────────────────────────────────────────────

interface AssessmentWithCriteriaSet extends assessmentDomain.AssessmentListItem {
  criteriaSet?: any
}

const assessment = ref<AssessmentWithCriteriaSet | null>(null)
const loading = ref(true)
const savingReview = ref(false)
const savingApprove = ref(false)
const formError = ref('')

// Review mode
const isReviewing = ref(false) // Phase 2 — editable review

// Override state per question
interface OverrideEntry {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

const overrides = ref<OverrideEntry[]>([])

// Tier/rate state
interface TierInfo {
  id: string
  name: string
  lowRate: number
  highRate: number
  defaultRate: number // auto-calculated at configured percentile of range
  minScore: number | null
  maxScore: number | null
}
const availableTiers = ref<TierInfo[]>([])
const approveTierId = ref('')
const approveRateOverride = ref('')
const approveRationale = ref('')
const rateError = ref('')
const defaultTierPercentile = ref(50) // fallback, loaded from settings
const roundTierRateToNearest5 = ref(true) // fallback, loaded from settings

/** Round a value to the nearest $5 */
function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5
}

/** Calculate default rate for a tier at configured percentile of range */
function calcDefaultRate(low: number, high: number, percentile?: number): number {
  const p = percentile ?? defaultTierPercentile.value
  const range = high - low
  let result = low + (range * p / 100)
  if (roundTierRateToNearest5.value) {
    result = roundToNearest5(result)
  }
  return result
}

/** Format rate as dollar string */
function formatRate(value: number | null | undefined): string {
  if (value == null) return '—'
  return `$${value.toFixed(2)}`
}

/** Display label for the default rate column (e.g. "Default (75%)") */
const defaultRateLabel = computed(() => `Default (${defaultTierPercentile.value}%)`)

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

/** Selected tier info for display */
const selectedTierInfo = computed<TierInfo | null>(() => {
  if (!approveTierId.value) return null
  // id and name are both the label string, so match by either
  return availableTiers.value.find(t => t.id === approveTierId.value || t.name === approveTierId.value) || null
})

/** Whether the assessment is already approved (read-only view) */
const isApproved = computed(() => assessment.value?.status === 'APPROVED')

/** Tier that matches the admin score (for auto-assign highlight) */
const autoAssignedTierId = computed<string | null>(() => {
  const score = adminScore.value
  if (score == null) return null
  const tier = availableTiers.value.find(t =>
    t.minScore != null && t.maxScore != null &&
    score >= t.minScore && score <= t.maxScore
  )
  return tier ? tier.id : null
})

/** Round rate input to nearest $5 on blur */
/** Round to nearest $5 and validate against tier range */
function roundAndValidateRate(): void {
  const raw = parseFloat(approveRateOverride.value)
  if (isNaN(raw) || !approveRateOverride.value.trim()) { rateError.value = ''; return }

  // Only round when the user has finished typing (not on every keystroke)
  const rounded = roundToNearest5(raw)
  approveRateOverride.value = String(rounded)

  // Validate against selected tier range
  const tier = selectedTierInfo.value
  if (tier && (rounded < tier.lowRate || rounded > tier.highRate)) {
    rateError.value = `Rate must be within ${formatRate(tier.lowRate)}–${formatRate(tier.highRate)}`
  } else {
    rateError.value = ''
  }
}

/** Handle answer change — clear rationale when reverting to AI's choice */
function onAnswerChange(_questionId: string, index: number): void {
  const aiResults = assessment.value?.aiResults ? JSON.parse(assessment.value.aiResults as string) : []
  const aiAnswerId = aiResults[index]?.selectedAnswerId
  if (overrides.value[index].selectedAnswerId === aiAnswerId) {
    overrides.value[index].rationale = ''
  }
}

// ─── Helpers ───────────────────────────────────────────────────

/** Helper to filter out placeholder rationales from automated extraction */
const PLACEHOLDER_PATTERNS = [
  'Extracted from prose output',
  'Extracted by positional matching'
]

function getAiRationale(questionId: string): string {
  const results = assessmentDomain.getAiResults(assessment.value!)
  const result = results.find((r: any) => r.questionId === questionId)
  const rationale = result?.rationale || ''
  // Don't show auto-extraction placeholders as rationales
  if (PLACEHOLDER_PATTERNS.some(p => rationale.includes(p))) return ''
  return rationale
}

function isAnswerSameAsAI(questionId: string, answerId: string): boolean {
  const results = assessmentDomain.getAiResults(assessment.value!)
  const result = results.find((r: any) => r.questionId === questionId)
  return result?.selectedAnswerId === answerId
}

function getAiAnswerText(question: any): string {
  if (!assessment.value?.aiResults) return '—'
  const results = JSON.parse(assessment.value.aiResults as string)
  const result = results.find((r: any) => r.questionId === question.id)
  if (!result) return '—'

  const answers = question.answers || []
  const answer = answers.find((a: any) => a.id === result.selectedAnswerId)
  return answer?.text || '—'
}

function getAiScoreForQuestion(question: any): number {
  if (!assessment.value?.aiResults) return 0
  const results = JSON.parse(assessment.value.aiResults as string)
  const result = results.find((r: any) => r.questionId === question.id)
  if (!result) return 0

  const answers = question.answers || []
  const answer = answers.find((a: any) => a.id === result.selectedAnswerId)
  return answer?.score ?? 0
}

function getSortedAnswers(answers: any[]): any[] {
  return [...(answers || [])].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
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

    await loadDefaultTierPercentile()
    await loadRoundTierRateSetting()
    await loadTiers()
  } catch {
    formError.value = 'Failed to load assessment'
  } finally {
    loading.value = false
  }
}

/** Load the configured default tier percentile from application settings */
async function loadDefaultTierPercentile(): Promise<void> {
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/application-settings/defaultTierPercentile', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) {
      const setting = await response.json()
      defaultTierPercentile.value = Number(setting.value) ?? 50
    }
  } catch { /* use default */ }
}

/** Load the rounding preference from application settings */
async function loadRoundTierRateSetting(): Promise<void> {
  try {
    const token = localStorage.getItem('accessToken')
    const response = await fetch('/api/application-settings/roundTierRateToNearest5', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (response.ok) {
      const setting = await response.json()
      roundTierRateToNearest5.value = setting.value === true || setting.value === 'true' || Number(setting.value) === 1
    } else {
      // Default: on (true)
      roundTierRateToNearest5.value = true
    }
  } catch { /* default to true */ }
}

async function loadTiers() {
  try {
    const criteriaSetId = assessment.value?.criteriaSetId
    if (criteriaSetId) {
      const data = await assessmentDomain.fetchTierThresholds(criteriaSetId)
      availableTiers.value = data.thresholds.map((t: any): TierInfo => ({
        id: t.label,
        name: t.label,
        lowRate: Number(t.lowRate),
        highRate: Number(t.highRate),
        defaultRate: calcDefaultRate(Number(t.lowRate), Number(t.highRate)),
        minScore: t.minScore ?? null,
        maxScore: t.maxScore ?? null
      }))
    }
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
    toast.add({ severity: 'success', summary: 'Review Started', detail: 'You can now edit the AI evaluation results.', life: 8000 })
    isReviewing.value = true
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to start review'
    toast.add({ severity: 'error', summary: 'Error', detail: formError.value, life: 5000 })
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
      tierLabel: approveTierId.value || null,
      rateOverride: approveRateOverride.value ? parseFloat(approveRateOverride.value) : null,
      rationale: approveRationale.value || null
    })
    toast.add({ severity: 'success', summary: 'Assessment Approved', detail: 'Review saved successfully.', life: 8000 })
    setTimeout(() => router.push('/assessments'), 2000)
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Failed to save review'
    formError.value = errMessage
    toast.add({ severity: 'error', summary: 'Save Failed', detail: errMessage, life: 5000 })
  } finally {
    savingApprove.value = false
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────

onMounted(() => { fetchAssessment() })
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <!-- Header -->
    <header class="bg-white border-b border-slate-200 px-6 py-4">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        <div>
          <router-link to="/assessments" class="text-sm text-blue-600 hover:text-blue-800 mb-1 inline-block">← Back to Assessments</router-link>
          <h1 v-if="assessment" class="text-xl font-bold text-slate-900">
            Review — {{ assessment.hcp.firstName }} {{ assessment.hcp.lastName }}
          </h1>
        </div>
        <span :class="['inline-flex items-center px-3 py-1 rounded-full text-sm font-medium', assessmentDomain.getStatusColor(assessment?.status || '')]">
          {{ assessment ? assessmentDomain.getStatusLabel(assessment.status) : '' }}
        </span>
      </div>
    </header>

    <!-- Main Content -->
    <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">

      <!-- Error Message -->
      <div v-if="formError && !loading" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
        <i class="pi pi-times-circle h-5 w-5 text-red-400 mt-0.5 mr-3 shrink-0"></i>
        <p class="text-sm text-red-600">{{ formError }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="bg-white shadow rounded-lg p-8 text-center">
        <p class="text-sm text-slate-500">Loading assessment...</p>
      </div>

      <!-- ═══════════════════════════════════════════════════════════
           APPROVED: Read-only summary
           ═══════════════════════════════════════════════════════════ -->
      <div v-else-if="assessment && isApproved" class="space-y-6">
        <!-- Score & Tier Summary -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Assessment Approved</h2>
          <div class="flex items-center gap-8">
            <div>
              <p class="text-sm text-slate-500">Approved Score</p>
              <p class="text-2xl font-bold text-green-700">{{ assessment.totalScore ?? '—' }}</p>
            </div>
            <div>
              <p class="text-sm text-slate-500">Tier</p>
              <p class="text-2xl font-semibold text-slate-900">{{ assessment.tierLabel || '—' }}</p>
            </div>
            <div>
              <p class="text-sm text-slate-500">Rate</p>
              <p class="text-2xl font-semibold text-green-700">${{ (assessment.rate != null ? Number(assessment.rate) : null)?.toFixed(2) ?? '—' }}</p>
            </div>
          </div>
        </section>

        <!-- AI Results (read-only) -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">AI Evaluation</h2>
          <div v-if="assessment.criteriaSet?.questions" class="space-y-4">
            <div v-for="(question, index) in assessment.criteriaSet.questions" :key="question.id" class="border border-slate-200 rounded-lg p-4">
              <h3 class="text-sm font-medium text-slate-900 mb-3">
                <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mr-2">{{ index + 1 }}</span>
                {{ question.text }}
              </h3>

              <!-- AI's Selection -->
              <div v-if="assessment.aiResults" class="flex items-start gap-3">
                <i class="pi pi-sparkles text-slate-500 mt-0.5 flex-shrink-0"></i>
                <div class="flex-1">
                  <p class="text-sm font-medium text-slate-700 mb-1">{{ getAiAnswerText(question) }}</p>
                  <p class="text-xs text-slate-500">{{ getAiScoreForQuestion(question) }} pts</p>
                  <p v-if="getAiRationale(question.id)" class="text-xs text-slate-500 mt-2 italic">"{{ getAiRationale(question.id) }}"</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Back button -->
        <div class="flex justify-center">
          <router-link to="/assessments"
            class="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors">
            ← Back to Assessments
          </router-link>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════
           PHASE 1: Read-only AI Results (before "Start Review")
           ═══════════════════════════════════════════════════════════ -->
      <div v-else-if="assessment && !isReviewing" class="space-y-6">
        <!-- Score Banner -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">AI Evaluation Results</h2>
          <div class="flex items-center gap-8">
            <div>
              <p class="text-sm text-slate-500">AI Total Score</p>
              <p class="text-3xl font-bold text-slate-900">{{ aiScore ?? '—' }}</p>
            </div>
          </div>
        </section>

        <!-- AI Results Cards -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Detailed Results</h2>
          <div v-if="assessment.criteriaSet?.questions" class="space-y-4">
            <div v-for="(question, index) in assessment.criteriaSet.questions" :key="question.id" class="border border-slate-200 rounded-lg p-4">
              <h3 class="text-sm font-medium text-slate-900 mb-3">
                <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mr-2">{{ index + 1 }}</span>
                {{ question.text }}
              </h3>

              <!-- AI's Selection -->
              <div class="flex items-start gap-3">
                <i class="pi pi-sparkles text-slate-500 mt-0.5 flex-shrink-0"></i>
                <div class="flex-1">
                  <p class="text-sm font-medium text-slate-700 mb-1">{{ getAiAnswerText(question) }}</p>
                  <p class="text-xs text-slate-500">{{ getAiScoreForQuestion(question) }} pts</p>
                  <p v-if="getAiRationale(question.id)" class="text-xs text-slate-500 mt-2 italic">"{{ getAiRationale(question.id) }}"</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Start Review Button -->
        <div class="flex justify-center pt-2">
          <button
            @click="startReview"
            :disabled="savingReview"
            class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {{ savingReview ? 'Starting...' : 'Start Review' }}
          </button>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════
           PHASE 2: Editable Review + Approve
           ═══════════════════════════════════════════════════════════ -->
      <div v-else-if="assessment && isReviewing" class="space-y-6">
        <!-- Score Comparison Banner -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Review & Approve</h2>
          <div class="flex items-center gap-4">
            <div class="flex-1 text-center">
              <p class="text-sm text-slate-500 mb-1">AI Score</p>
              <p class="text-3xl font-bold text-slate-900">{{ aiScore ?? '—' }}</p>
            </div>
            <i class="pi pi-arrow-right text-slate-400 text-xl"></i>
            <div class="flex-1 text-center">
              <p class="text-sm text-slate-500 mb-1">Admin Score</p>
              <p class="text-3xl font-bold text-blue-700">{{ adminScore ?? '—' }}</p>
            </div>
          </div>
        </section>

        <!-- Question Cards (Editable) -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Evaluate Each Question</h2>
          <p class="text-sm text-slate-500 mb-6">Review the AI's selections below. Change any answer to override the AI's recommendation.</p>

          <div v-if="assessment.criteriaSet?.questions" class="space-y-4">
            <div v-for="(question, index) in assessment.criteriaSet.questions" :key="question.id" class="border border-slate-200 rounded-lg p-4">
              <!-- Question header -->
              <h3 class="text-sm font-medium text-slate-900 mb-3">
                <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mr-2">{{ index + 1 }}</span>
                {{ question.text }}
              </h3>

              <!-- AI's Selection (read-only) -->
              <div v-if="assessment.aiResults" class="mb-3 flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <i class="pi pi-sparkles text-slate-500 mt-0.5 flex-shrink-0"></i>
                <div class="flex-1">
                  <p class="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">AI Selection</p>
                  <p class="text-sm font-medium text-slate-700">{{ getAiAnswerText(question) }}</p>
                  <p class="text-xs text-slate-500">{{ getAiScoreForQuestion(question) }} pts</p>
                  <p v-if="getAiRationale(question.id)" class="text-xs text-slate-500 mt-1 italic">"{{ getAiRationale(question.id) }}"</p>
                </div>
              </div>

              <!-- Admin Selection -->
              <div>
                <label :for="`answer-${question.id}`" class="block text-sm font-medium text-slate-700 mb-1">Your Answer</label>
                <select
                  :id="`answer-${question.id}`"
                  v-model="overrides[index].selectedAnswerId"
                  @change="onAnswerChange(question.id, index)"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent form-select"
                >
                  <option value="">Select answer...</option>
                  <option v-for="answer in getSortedAnswers(question.answers)" :key="answer.id" :value="answer.id">
                    {{ answer.text }} ({{ answer.score }} pts)
                    <span v-if="isAnswerSameAsAI(question.id, answer.id)" class="text-slate-400 text-xs"> ← AI choice</span>
                  </option>
                </select>
              </div>

              <!-- Admin Rationale (shown when different from AI's choice) -->
              <div v-if="overrides[index].selectedAnswerId && !isAnswerSameAsAI(question.id, overrides[index].selectedAnswerId)" class="mt-3">
                <label :for="`rationale-${question.id}`" class="block text-sm font-medium text-slate-700 mb-1">Rationale (optional)</label>
                <input
                  :id="`rationale-${question.id}`"
                  v-model="overrides[index].rationale"
                  type="text"
                  placeholder="Why this answer?"
                  class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Tier & Rate -->
        <section class="bg-white shadow rounded-lg p-6">
          <h2 class="text-lg font-semibold text-slate-900 mb-4">Tier & Rate</h2>

          <!-- Zero-score warning -->
          <div v-if="isZeroScore" class="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
            <i class="pi pi-exclamation-triangle h-5 w-5 text-red-400 mt-0.5 mr-3 shrink-0"></i>
            <div>
              <p class="text-sm font-semibold text-red-900 mb-1">Manual Review Required</p>
              <p class="text-xs text-red-700">Score is zero — auto-approval is disabled. Please provide a rationale before approving.</p>
            </div>
          </div>

          <!-- Tier reference table -->
          <div v-if="availableTiers.length > 0" class="mb-6 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="border-b border-slate-200">
                  <th class="px-3 py-2 text-left font-medium text-slate-500">Tier</th>
                  <th class="px-3 py-2 text-right font-medium text-slate-500">Score Range</th>
                  <th class="px-3 py-2 text-right font-medium text-slate-500">Rate Range</th>
                  <th class="px-3 py-2 text-right font-medium text-slate-500">{{ defaultRateLabel }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tier in availableTiers" :key="tier.id"
                  :class="[
                    'border-b border-slate-100',
                    approveTierId === tier.id || autoAssignedTierId === tier.id
                      ? 'bg-blue-50'
                      : 'hover:bg-slate-50'
                  ]">
                  <td class="px-3 py-2 font-medium text-slate-900">{{ tier.name }}</td>
                  <td v-if="tier.minScore != null && tier.maxScore != null" class="px-3 py-2 text-right text-slate-600">
                    {{ tier.minScore }}–{{ tier.maxScore }}
                    <span v-if="autoAssignedTierId === tier.id"
                      class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">
                      auto
                    </span>
                  </td>
                  <td v-else class="px-3 py-2 text-right text-slate-400">—</td>
                  <td class="px-3 py-2 text-right text-slate-600">{{ formatRate(tier.lowRate) }} – {{ formatRate(tier.highRate) }}</td>
                  <td class="px-3 py-2 text-right font-medium text-green-700">{{ formatRate(tier.defaultRate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Tier selection -->
          <div class="space-y-4">
            <div>
              <label for="approve-tier" class="block text-sm font-medium text-slate-700 mb-1">Tier</label>
              <select id="approve-tier" v-model="approveTierId" :disabled="isZeroScore"
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed form-select">
                <option value="">Auto-assign based on score</option>
                <option v-for="tier in availableTiers" :key="tier.id" :value="tier.id">
                  {{ tier.name }}
                  <template v-if="tier.minScore != null && tier.maxScore != null"> — {{ tier.minScore }}–{{ tier.maxScore }}</template>
                </option>
              </select>
              <p v-if="autoAssignedTierId && !approveTierId && !isZeroScore"
                class="text-xs text-blue-600 mt-1">
                → Score {{ adminScore }} would auto-assign to
                <strong>{{ availableTiers.find(t => t.id === autoAssignedTierId)?.name }}</strong>
              </p>
            </div>

            <!-- Rate Override -->
            <div>
              <label for="rate-override" class="block text-sm font-medium text-slate-700 mb-1">
                FMV Rate (optional)
                <span v-if="selectedTierInfo" class="text-slate-500 font-normal">
                  — range: {{ formatRate(selectedTierInfo.lowRate) }}–{{ formatRate(selectedTierInfo.highRate) }}, default: <strong>{{ formatRate(selectedTierInfo.defaultRate) }}</strong>
                </span>
              </label>
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input id="rate-override" v-model="approveRateOverride"
                    type="number" step="5" min="0"
                    @blur="roundAndValidateRate"
                    placeholder="Auto-calculated if left blank"
                    class="w-full ps-6 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
              </div>
              <p v-if="rateError" class="text-xs text-red-600 mt-1">{{ rateError }}</p>
            </div>

            <!-- Approval Rationale -->
            <div>
              <label for="approve-rationale" class="block text-sm font-medium text-slate-700 mb-1">Approval Rationale (optional)</label>
              <textarea id="approve-rationale" v-model="approveRationale" rows="2" placeholder="Explain approval decision..."
                class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
            </div>
          </div>
        </section>

        <!-- Action Buttons -->
        <section class="bg-white shadow rounded-lg p-6">
          <div class="flex items-center justify-between">
            <router-link to="/assessments" class="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors">Cancel</router-link>
            <button
              @click="saveAndApprove"
              :disabled="savingApprove || !adminScore"
              class="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {{ savingApprove ? 'Saving...' : 'Save Review & Approve' }}
            </button>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>
