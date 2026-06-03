import { PrismaClient } from '@prisma/client'
import axios from 'axios'

const prisma = new PrismaClient()

// LLM configuration — defaults to Ollama (common local LLM runner)
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://localhost:11434'
const LLM_MODEL = process.env.LLM_MODEL || 'qwen2.5:32b'

interface CriteriaQuestion {
  id: string
  text: string
  answers: Array<{
    id: string
    text: string
    score: number
  }>
}

interface AIResult {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

/**
 * Process a single assessment job — called by the BullMQ worker.
 * Fetches assessment data, calls local LLM, parses results, updates DB.
 */
export async function processAssessmentJob(assessmentId: string, _userId: string): Promise<void> {
  // Step 1: Fetch assessment with all related data
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      hcp: true,
      criteriaSet: {
        include: {
          questions: {
            where: { isActive: true },
            include: { answers: { where: { isActive: true } } }
          }
        }
      },
      specialty: true
    }
  })

  if (!assessment) {
    console.error(`Assessment ${assessmentId} not found`)
    return
  }

  // Validate assessment is in AI_PROCESSING state
  if (assessment.status !== 'AI_PROCESSING') {
    console.warn(`Assessment ${assessmentId} is not in AI_PROCESSING state: ${assessment.status}`)
    return
  }

  // Validate we have CV text and criteria set
  if (!assessment.cvText || !assessment.criteriaSetId) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'REJECTED', rejectionReason: 'Missing required data (CV text or criteria set)' }
    })
    return
  }

  if (!assessment.criteriaSet) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'REJECTED', rejectionReason: 'Criteria set not found' }
    })
    return
  }

  const questions = assessment.criteriaSet.questions as unknown as CriteriaQuestion[]

  if (questions.length === 0) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'REJECTED', rejectionReason: 'No active criteria questions found' }
    })
    return
  }

  // Step 2: Construct the prompt for the LLM
  const systemPrompt = assessment.criteriaSet.systemPrompt || buildDefaultSystemPrompt(questions)
  const userPrompt = buildUserPrompt(assessment, questions)

  // Step 3: Call local LLM
  let llmResponse: string
  try {
    llmResponse = await callLocalLLM(systemPrompt, userPrompt)
  } catch (error) {
    console.error('LLM call failed:', error instanceof Error ? error.message : 'Unknown error')
    // Mark as failed but keep in AI_COMPLETE so admin can review partial results
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'AI_COMPLETE' }
    })
    return
  }

  // Step 4: Parse LLM response into structured AI results
  const aiResults = parseLLMResponse(llmResponse, questions)

  if (aiResults.length === 0) {
    console.warn('No valid AI results parsed from LLM response')
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'AI_COMPLETE' }
    })
    return
  }

  // Step 5: Compute total score and update assessment
  const totalScore = aiResults.reduce((sum, r) => {
    const answer = questions.find(q => q.id === r.questionId)?.answers.find(a => a.id === r.selectedAnswerId)
    return sum + (answer?.score ?? 0)
  }, 0)

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: 'AI_COMPLETE',
      aiResults: JSON.stringify(aiResults),
      totalScore,
      completedAt: new Date()
    }
  })

  console.log(`Assessment ${assessmentId} processed — score: ${totalScore}, results: ${aiResults.length} questions`)
}

/**
 * Build the default system prompt when none is configured.
 * Uses explicit examples and strong formatting instructions to reduce LLM inconsistency.
 */
function buildDefaultSystemPrompt(_questions: CriteriaQuestion[]): string {
  return `You are an expert evaluator for Fair Market Value (FMV) assessments of healthcare professionals (HCPs).

Your task is to review the HCP's CV text and select the BEST matching answer for each evaluation question. For each question, you must choose exactly ONE answer from the provided options.

RULES:
1. Select only one answer per question — the most accurate based on the CV evidence.
2. Provide a brief rationale (1-2 sentences) explaining why you chose that answer.
3. Base your selections STRICTLY on the information in the CV text. Do not invent or assume facts.
4. If the CV does not contain sufficient information for a question, select the lowest-scoring answer and note "insufficient data" in the rationale.

OUTPUT FORMAT — EXACTLY THIS JSON STRUCTURE:
You MUST return ONLY a valid JSON array. No markdown code blocks (no \`\`\`). No extra text before or after the JSON.
Use these EXACT field names: questionId, selectedAnswerId, rationale (camelCase).

EXAMPLE OUTPUT:
[
  {
    "questionId": "abc-123",
    "selectedAnswerId": "def-456",
    "rationale": "The CV shows 8 years of experience which meets the 5+ years criterion."
  },
  {
    "questionId": "ghi-789",
    "selectedAnswerId": "jkl-012",
    "rationale": "Insufficient data in the CV to determine this criterion."
  }
]`
}

/**
 * Build the user prompt containing CV text and evaluation criteria.
 */
function buildUserPrompt(assessment: any, questions: CriteriaQuestion[]): string {
  const hcpInfo = assessment.hcp
  const specialtyName = assessment.specialty?.name || 'Unknown'

  let prompt = `## HCP Information\n`
  prompt += `- Name: ${hcpInfo.firstName} ${hcpInfo.lastName}\n`
  if (hcpInfo.email) prompt += `- Email: ${hcpInfo.email}\n`
  if (hcpInfo.phone) prompt += `- Phone: ${hcpInfo.phone}\n`
  if (hcpInfo.state) prompt += `- State: ${hcpInfo.state}\n`
  if (specialtyName && specialtyName !== 'Unknown') prompt += `- Specialty: ${specialtyName}\n`

  prompt += `\n## CV Text\n${assessment.cvText}\n`

  prompt += `\n## Evaluation Criteria\n`
  for (const question of questions) {
    prompt += `\n### Question ${question.id}: ${question.text}\n`
    const sortedAnswers = [...question.answers].sort((a, b) => a.score - b.score)
    for (const answer of sortedAnswers) {
      prompt += `- [${answer.id}] (${answer.score} pts): ${answer.text}\n`
    }
  }

  prompt += `\nPlease return your evaluation as a JSON array.`

  return prompt
}

/**
 * Call the local LLM API (Ollama-compatible endpoint).
 */
async function callLocalLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await axios.post(`${LLM_BASE_URL}/v1/chat/completions`, {
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: false
  })

  return response.data.choices?.[0]?.message?.content || ''
}

/**
 * Normalize a raw LLM response item by mapping all known field name aliases to canonical names.
 * The model is inconsistent — it may use questionId/question_id, selectedAnswerId/answerId/option_id/id, etc.
 */
function normalizeItem(item: Record<string, unknown>): { questionId?: string; selectedAnswerId?: string; rationale?: string } {
  const normalized: Record<string, unknown> = {}

  // Map all known aliases to canonical names
  for (const [key, value] of Object.entries(item)) {
    if (typeof key !== 'string' || typeof value === 'undefined') continue
    const lowerKey = key.toLowerCase()

    if (lowerKey === 'questionid' || lowerKey === 'question_id') normalized.questionId = String(value)
    else if (lowerKey === 'selectedanswerid' || lowerKey === 'answerid' || lowerKey === 'answer_id' || lowerKey === 'option_id' || lowerKey === 'id') {
      // Only map 'id' to selectedAnswerId if we already have a questionId
      if (!normalized.questionId) continue
      normalized.selectedAnswerId = String(value)
    }
    else if (lowerKey === 'rationale' || lowerKey === 'reasoning' || lowerKey === 'explanation') normalized.rationale = String(value)
  }

  return normalized as { questionId?: string; selectedAnswerId?: string; rationale?: string }
}

/**
 * Parse the LLM JSON response into structured AI results.
 */
function parseLLMResponse(response: string, questions: CriteriaQuestion[]): AIResult[] {
  const extracted = extractJSONFromResponse(response)

  if (!extracted) {
    console.warn('Could not extract JSON from LLM response')
    return []
  }

  const results: AIResult[] = []
  const questionIds = new Set(questions.map(q => q.id))
  const answerMap = new Map<string, Set<string>>() // questionId -> set of valid answer ids

  for (const q of questions) {
    answerMap.set(q.id, new Set(q.answers.map(a => a.id)))
  }

  for (const item of extracted) {
    const normalized = normalizeItem(item as Record<string, unknown>)
    const { questionId, selectedAnswerId, rationale } = normalized

    if (!selectedAnswerId || !questionId) continue
    if (!questionIds.has(questionId)) continue
    const validAnswers = answerMap.get(questionId)
    if (!validAnswers?.has(selectedAnswerId)) continue

    results.push({
      questionId,
      selectedAnswerId,
      rationale: String(rationale || '').slice(0, 500) // Cap rationale length
    })
  }

  return results
}

/**
 * Extract JSON array from a potentially messy LLM response.
 * Handles markdown code blocks, extra text, and various formats.
 */
function extractJSONFromResponse(text: string): any[] {
  // Strip markdown code block wrappers
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()

  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
  } catch { /* fall through */ }

  // Try to find JSON array in the text
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch { /* fall through */ }
  }

  // Try to find JSON object(s) in the text
  const objMatches = cleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
  if (objMatches) {
    try {
      return objMatches.map(m => JSON.parse(m)).filter(Boolean)
    } catch { /* fall through */ }
  }

  return []
}
