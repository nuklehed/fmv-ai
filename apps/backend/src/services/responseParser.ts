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

function normalizeItem(item: Record<string, unknown>): { questionId?: string; selectedAnswerId?: string; rationale?: string } {
  const normalized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(item)) {
    if (typeof key !== 'string' || typeof value === 'undefined') continue
    const lowerKey = key.toLowerCase().replace(/[_\s]/g, '')

    // questionId aliases: questionid, question_id, question
    if (lowerKey === 'questionid' || lowerKey === 'question_id' || lowerKey === 'question') {
      normalized.questionId = stripBrackets(String(value))
    }
    // selectedAnswerId aliases: selectedanswerid, answerid, answer_id, option_id, id,
    //   selectedanswer, selected_answer, selected_answer_id, answer, option,
    //   selected_option, selectedoption
    else if (lowerKey === 'selectedanswerid' || lowerKey === 'answerid' || lowerKey === 'answer_id'
      || lowerKey === 'optionid' || lowerKey === 'option_id' || lowerKey === 'id'
      || lowerKey === 'selectedanswer' || lowerKey === 'selected_answer'
      || lowerKey === 'selected_option' || lowerKey === 'selectedoption'
      || lowerKey === 'answer' || lowerKey === 'option') {
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
function extractJSONFromResponse(text: string): unknown[] {
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
 * Try to match a synthetic positional ID (e.g., 'q1', 'a2') to actual DB IDs.
 * Returns null if not a positional pattern, or the matched real ID.
 */
function tryMatchPositionalId(synthetic: string, questions: CriteriaQuestion[]): { questionId?: string; answerId?: string } {
  // Match q1/q2/... → question index
  const qMatch = synthetic.match(/^q(\d+)$/i)
  if (qMatch) {
    const idx = parseInt(qMatch[1]) - 1
    if (idx >= 0 && idx < questions.length) {
      return { questionId: questions[idx].id }
    }
  }

  // Match a1/a2/... → answer index for first question
  const aMatch = synthetic.match(/^a(\d+)$/i)
  if (aMatch) {
    const idx = parseInt(aMatch[1]) - 1
    if (idx >= 0 && questions.length > 0 && idx < questions[0].answers.length) {
      return { answerId: questions[0].answers[idx].id }
    }
  }

  // Match q1a2 pattern
  const qaMatch = synthetic.match(/^q(\d+)a(\d+)$/i)
  if (qaMatch) {
    const qIdx = parseInt(qaMatch[1]) - 1
    const aIdx = parseInt(qaMatch[2]) - 1
    if (qIdx >= 0 && qIdx < questions.length && aIdx >= 0 && aIdx < questions[qIdx].answers.length) {
      return { questionId: questions[qIdx].id, answerId: questions[qIdx].answers[aIdx].id }
    }
  }

  return {}
}

/**
 * Extract positional IDs from prose text (e.g., "Question q1" → q1, "answer a2" → a2).
 * Returns an array of { questionNum: number, answerNum?: number } pairs.
 */
function extractPositionalIdsFromProse(text: string): Array<{ questionNum: number; answerNum?: number }> {
  const results: Array<{ questionNum: number; answerNum?: number }> = []

  // Pattern 1: "Question qN" or "qN:" — standalone question reference
  const qPattern = /(?:question\s+)?q(\d+)/gi
  let m
  while ((m = qPattern.exec(text)) !== null) {
    const qNum = parseInt(m[1])
    // Look ahead for an answer reference within the next ~200 chars
    const context = text.substring(m.index, Math.min(m.index + 300, text.length))
    const aMatch = context.match(/a(\d+)/i)
    results.push({ questionNum: qNum, answerNum: aMatch ? parseInt(aMatch[1]) : undefined })
  }

  // Pattern 2: "qN → aM" or "qN selects aM"
  const qaPattern = /q(\d+)\s*[→|,]\s*a(\d+)/gi
  while ((m = qaPattern.exec(text)) !== null) {
    results.push({ questionNum: parseInt(m[1]), answerNum: parseInt(m[2]) })
  }

  // Deduplicate by question number (keep first occurrence)
  const seen = new Set<number>()
  return results.filter(r => { if (seen.has(r.questionNum)) return false; seen.add(r.questionNum); return true })
}

/**
 * Parse the LLM JSON response into structured AI results.
 * Validates each result against the criteria questions and their valid answers.
 * Uses positional fallback matching when the model generates synthetic IDs (q1, a2).
 */
export function parseLLMResponse(response: string, questions: CriteriaQuestion[]): AIResult[] {
  const extracted = extractJSONFromResponse(response)

  if (!extracted.length) {
    // Fallback: try to extract positional IDs from prose text
    const proseMatches = extractPositionalIdsFromProse(response)
    if (proseMatches.length > 0) {
      return proseMatches.map(({ questionNum, answerNum }) => {
        let questionId: string | undefined
        let selectedAnswerId: string | undefined

        // Match qN to actual question
        const qIdx = questionNum - 1
        if (qIdx >= 0 && qIdx < questions.length) {
          questionId = questions[qIdx].id
        }

        // Match aN to answer within that question
        if (answerNum !== undefined && questionId) {
          const aIdx = answerNum - 1
          const answers = questions.find(q => q.id === questionId)?.answers || []
          if (aIdx >= 0 && aIdx < answers.length) {
            selectedAnswerId = answers[aIdx].id
          }
        } else if (!answerNum && questionId) {
          // No answer specified — default to lowest scoring answer
          const qAnswers = questions.find(q => q.id === questionId)?.answers || []
          if (qAnswers.length > 0) {
            selectedAnswerId = qAnswers.reduce((min, a) => a.score < min.score ? a : min, qAnswers[0]).id
          }
        }

        return { questionId: questionId!, selectedAnswerId: selectedAnswerId!, rationale: 'Extracted from prose output by positional matching' }
      }).filter(r => r.questionId && r.selectedAnswerId)
    }
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
    let { questionId, selectedAnswerId, rationale } = normalized

    // If normalization didn't produce valid fields, try positional matching
    if (!selectedAnswerId || !questionId) {
      // Check if this is a shorthand like {"q1": "a2"}
      const entries = Object.entries(item as Record<string, unknown>)
      for (const [key, value] of entries) {
        if (typeof key !== 'string' || typeof value === 'undefined') continue
        const positional = tryMatchPositionalId(key, questions)
        if (positional.questionId && !questionId) questionId = positional.questionId
        if (positional.answerId && !selectedAnswerId) selectedAnswerId = positional.answerId
      }
    }

    // If still no match via normalization, try treating the whole item as positional shorthand
    if (!selectedAnswerId || !questionId) {
      const entries = Object.entries(item as Record<string, unknown>)
      for (const [key, value] of entries) {
        if (typeof key !== 'string' || typeof value === 'undefined') continue
        const positional = tryMatchPositionalId(key, questions)
        if (!positional.questionId && !positional.answerId) continue
        if (!questionId) questionId = positional.questionId
        if (!selectedAnswerId) selectedAnswerId = positional.answerId || stripBrackets(String(value))
      }
    }

    // Final validation: check against actual DB IDs
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
