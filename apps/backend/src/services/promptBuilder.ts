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

/** Format a date for display in prompts (e.g. "June 8, 2026") */
function formatDateForPrompt(date: Date | string | null | undefined): string {
  if (!date) return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Build the default system prompt when none is configured.
 * Uses explicit examples and strong formatting instructions to reduce LLM inconsistency.
 */
function buildDefaultSystemPrompt(_questions: CriteriaQuestion[], evalDate: string): string {
  return `You are an expert evaluator for Fair Market Value (FMV) assessments of healthcare professionals (HCPs).

REFERENCE DATE: The current date for this evaluation is ${evalDate}. All time-based criteria ("past X years", "in the past 7 years", etc.) should be evaluated relative to ${evalDate}.

Your task is to review the HCP's CV text and select the BEST matching answer for each evaluation question. For each question, you must choose exactly ONE answer from the provided options.

RULES:
1. Select only one answer per question — the most accurate based on the CV evidence.
2. Provide a brief rationale (1-2 sentences) explaining why you chose that answer.
3. Base your selections STRICTLY on the information in the CV text. Do not invent or assume facts.
4. If the CV does not contain sufficient information for a question, select the lowest-scoring answer and note "insufficient data" in the rationale.

OUTPUT FORMAT — ABSOLUTE REQUIREMENT:
Return ONLY a valid JSON array. No introductory text, no explanatory prose, no markdown formatting, no code block wrappers.

Each object must have exactly these three fields:
- "questionId": the EXACT UUID from the question list (36 chars)
- "selectedAnswerId": the EXACT UUID from that question's answer options (36 chars)
- "rationale": a brief explanation string

Do NOT use short codes like "q1", "a2", or any abbreviated form.`
}

/**
 * Build the user prompt containing HCP info, CV text and evaluation criteria.
 */
function buildUserPrompt(assessment: Assessment & { hcp: Hcp; specialty?: Specialty | null }, questions: CriteriaQuestion[], evalDate: string): string {
  const hcp = assessment.hcp
  const specialtyName = assessment.specialty?.name || 'Unknown'

  let prompt = `## Reference Date\nCurrent date for evaluation: ${evalDate}\n\n`
  prompt += `## HCP Information\n`
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
      prompt += `- ID: ${answer.id} | Score: ${answer.score} pts | ${answer.text}\n`
    }
  }

  prompt += `\nIMPORTANT: When returning your evaluation, use the EXACT UUID strings shown above for questionId and selectedAnswerId. Do NOT abbreviate or modify them in any way.`

  return prompt
}

/**
 * Construct the system + user prompt pair for an assessment.
 */
export function buildPrompt(
  assessment: Assessment & { hcp: Hcp; specialty?: Specialty | null; criteriaSet?: { systemPrompt?: string } },
  questions: CriteriaQuestion[]
): PromptPair {
  const evalDate = formatDateForPrompt(assessment.submittedAt)
  const systemPrompt = assessment.criteriaSet?.systemPrompt || buildDefaultSystemPrompt(questions, evalDate)
  const userPrompt = buildUserPrompt(assessment, questions, evalDate)

  return { systemPrompt, userPrompt }
}
