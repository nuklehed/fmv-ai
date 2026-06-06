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

FIELD NAMES — USE THESE EXACT camelCase NAMES:
- "questionId"  (NOT "question", NOT "q1", NOT "question_id")
- "selectedAnswerId"  (NOT "answer", NOT "a2", NOT "selected_answer", NOT "option")
- "rationale"

CRITICAL — ANSWER IDS ARE LONG UUID STRINGS, NOT SHORT CODES:
- Question IDs look like: "550e8400-e29b-41d4-a716-446655440000" (36 chars with dashes)
- Answer IDs look like: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" (36 chars with dashes)
- NEVER use short codes like "q1", "a2", "q1a2", or any abbreviated form
- NEVER wrap IDs in brackets — use plain strings: "550e8400-e29b..."

CRITICAL: Every answer in the array MUST have all three fields populated with valid values:
- "questionId": must be the EXACT UUID from the question list below (36 characters)
- "selectedAnswerId": must be the EXACT UUID from that question's answer options (36 characters)
- "rationale": must be a non-empty string explaining your choice

EXAMPLE OUTPUT:
[
  {
    "questionId": "550e8400-e29b-41d4-a716-446655440000",
    "selectedAnswerId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "rationale": "The CV shows 8 years of experience which meets the 5+ years criterion."
  },
  {
    "questionId": "7c9e6679-7122-4daa-b4ee-ef0f3b8d1a2c",
    "selectedAnswerId": "8d1e5503-f4ab-4c2d-a9e1-2b3c4d5e6f7a",
    "rationale": "Insufficient data in the CV to determine this criterion."
  }
]

WRONG — DO NOT USE THESE:
- {"q1": "a2"} ← completely wrong format, short codes not accepted
- {"question": "abc", "selected_answer": "[a2]"} ← wrong field names, bracket-wrapped IDs
- {"question_id": "abc", "answerId": "def"} ← snake_case or mixed case
- Any output wrapped in \`\`\`json code blocks`
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
  const systemPrompt = assessment.criteriaSet?.systemPrompt || buildDefaultSystemPrompt(questions)
  const userPrompt = buildUserPrompt(assessment, questions)

  return { systemPrompt, userPrompt }
}
