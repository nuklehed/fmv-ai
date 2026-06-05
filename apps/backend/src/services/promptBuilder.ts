import type { Assessment, Hcp, Specialty } from '@prisma/client'

export interface CriteriaQuestion {
  id: string
  text: string
  answers: Array<{ id: string; text: string; score: number }>
}

export interface PromptPair {
  systemPrompt: string
  userPrompt: string
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
 * Build the user prompt containing HCP info, CV text and evaluation criteria.
 */
function buildUserPrompt(assessment: Assessment & { hcp: Hcp; specialty?: Specialty | null }, questions: CriteriaQuestion[]): string {
  const hcp = assessment.hcp
  const specialtyName = assessment.specialty?.name || 'Unknown'

  let prompt = `## HCP Information\n`
  prompt += `- Name: ${hcp.firstName} ${hcp.lastName}\n`
  if (hcp.email) prompt += `- Email: ${hcp.email}\n`
  if (hcp.phone) prompt += `- Phone: ${hcp.phone}\n`
  if (hcp.state) prompt += `- State: ${hcp.state}\n`
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
 * Construct the system + user prompt pair for an assessment.
 */
export function buildPrompt(
  assessment: Assessment & { hcp: Hcp; specialty?: Specialty | null; criteriaSet?: { systemPrompt?: string } },
  questions: CriteriaQuestion[]
): PromptPair {
  const systemPrompt = assessment.criteriaSet?.systemPrompt || buildDefaultSystemPrompt(questions)
  const userPrompt = buildUserPrompt(assessment, questions)

  return { systemPrompt, userPrompt }
}
