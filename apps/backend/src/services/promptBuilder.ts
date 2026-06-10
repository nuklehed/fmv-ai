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
  const jsonExample = JSON.stringify([
    {
      questionId: '85977830-e6b4-5303-a871-9827606b433d',
      selectedAnswerId: '86c7d411-4c41-5772-912a-f781dea2debc',
      rationale: 'CV shows 11 years of practice since 2015 graduation.'
    },
    {
      questionId: 'fd586457-dee9-5764-b257-92a4769b5d8a',
      selectedAnswerId: '1bd623c2-9b10-5e83-95e9-b383c097df78',
      rationale: 'Board certified in Internal Medicine.'
    }
  ])

  return `You are an expert evaluator for Fair Market Value (FMV) assessments of healthcare professionals (HCPs).

REFERENCE DATE: The current date for this evaluation is ${evalDate}. All time-based criteria ("past X years", "in the past 7 years", etc.) should be evaluated relative to ${evalDate}.

Your task: Review the HCP's CV text and select the BEST matching answer for each evaluation question.

RULES:
1. Select only one answer per question — the most accurate based on the CV evidence.
2. Provide a brief rationale (1-2 sentences) explaining why you chose that answer.
3. Base your selections STRICTLY on the information in the CV text. Do not invent or assume facts.
4. **You do NOT have to answer every question.** If the CV contains no relevant information for a question, skip it entirely — omit it from your output.
5. When you skip a question, simply omit it from the JSON output. Do not return a placeholder or a "not applicable" answer.

OUTPUT FORMAT — ABSOLUTE REQUIREMENT:
Your ENTIRE response must be a single valid JSON array. Nothing else. No introductory text. No explanations. No markdown. No code blocks. No analysis. No bullet points. No prose.

START your response with [ and END with ]. Only valid JSON between them.

EXAMPLE of correct output:
${jsonExample}

NOTE: The example above has 2 results out of 10 questions. This is correct — only include questions where the CV has evidence. Questions with no evidence are simply omitted from the array.

Each object must have exactly these three fields:
- "questionId": the EXACT UUID from the question list (36 chars)
- "selectedAnswerId": the EXACT UUID from that question's answer options (36 chars)
- "rationale": a brief explanation string

DO NOT include any text before the opening [ or after the closing ].
DO NOT wrap the output in markdown code blocks (no backticks).
DO NOT write analysis, explanations, or commentary — only the JSON array.`
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

  prompt += `\n--- FINAL INSTRUCTION ---\nWhen returning your evaluation:\n`
  prompt += `- Use EXACT UUID strings for questionId and selectedAnswerId (36 chars each)\n`
  prompt += `- Only return questions you can answer from the CV evidence\n`
  prompt += `- Skip questions with no evidence — omit them entirely\n`
  prompt += `- Your ENTIRE response must be ONLY a JSON array\n`
  prompt += `- NO prose, NO analysis, NO markdown, NO explanations, NO bullet points`

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
