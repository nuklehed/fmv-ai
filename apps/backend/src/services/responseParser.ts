/**
 * Response Parser — extracts and normalizes structured results from raw LLM output.
 * Handles markdown code blocks, field name aliases, and validation against criteria.
 */

export interface AIResult {
  questionId: string
  selectedAnswerId: string
  rationale: string
}

interface CriteriaQuestion {
  id: string
  answers: Array<{ id: string }>
}

/**
 * Normalize a raw LLM response item by mapping all known field name aliases to canonical names.
 * The model is inconsistent — it may use questionId/question_id, selectedAnswerId/answerId/option_id/id, etc.
 */
/** Strip optional bracket wrappers from answer IDs (e.g., '[a2]' → 'a2') */
function stripBrackets(val: string): string {
  return val.replace(/^\[([^]]+)\]$/, '$1').trim()
}

export function normalizeItem(item: Record<string, unknown>): { questionId?: string; selectedAnswerId?: string; rationale?: string } {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(item)) {
    if (typeof key !== 'string' || typeof value === 'undefined') continue
    const lowerKey = key.toLowerCase().replace(/[_\s]/g, '')

    // questionId aliases: questionid, question_id, question
    if (lowerKey === 'questionid' || lowerKey === 'question_id' || lowerKey === 'question') {
      normalized.questionId = stripBrackets(String(value))
    }
    // selectedAnswerId aliases: selectedanswerid, answerid, answer_id, option_id, id,
    //   selectedanswer, selected_answer, selected_answer_id
    else if (lowerKey === 'selectedanswerid' || lowerKey === 'answerid' || lowerKey === 'answer_id'
      || lowerKey === 'optionid' || lowerKey === 'option_id' || lowerKey === 'id'
      || lowerKey === 'selectedanswer' || lowerKey === 'selected_answer') {
      // Only map bare 'id' to selectedAnswerId if we already have a questionId
      if (lowerKey === 'id' && !normalized.questionId) continue
      normalized.selectedAnswerId = stripBrackets(String(value))
    }
    else if (lowerKey === 'rationale' || lowerKey === 'reasoning' || lowerKey === 'explanation') {
      normalized.rationale = String(value)
    }
  }

  return normalized as { questionId?: string; selectedAnswerId?: string; rationale?: string }
}

/**
 * Extract JSON array from a potentially messy LLM response.
 * Handles markdown code blocks, extra text, and various formats.
 */
export function extractJSONFromResponse(text: string): unknown[] {
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

/**
 * Parse the LLM JSON response into structured AI results.
 * Validates each result against the criteria questions and their valid answers.
 */
export function parseLLMResponse(response: string, questions: CriteriaQuestion[]): AIResult[] {
  const extracted = extractJSONFromResponse(response)

  if (!extracted.length) {
    return []
  }

  const results: AIResult[] = []
  const questionIds = new Set(questions.map(q => q.id))
  const answerMap = new Map<string, Set<string>>() // questionId -> set of valid answer ids

  for (const q of questions) {
    answerMap.set(q.id, new Set(q.answers.map(a => a.id)))
  }

  for (const item of extracted) {
    if (!item || typeof item !== 'object') continue

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
