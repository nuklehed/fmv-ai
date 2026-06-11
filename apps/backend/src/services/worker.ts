import { PrismaClient } from '@prisma/client'
import type { Assessment, Hcp, Specialty } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { buildPrompt, type CriteriaQuestion } from './promptBuilder'
import { createLLMClient } from './llmClient'
import { parseLLMResponse } from './responseParser'

const LOG_DIR = process.env.LLM_LOG_DIR || path.join(process.cwd(), 'logs')
let logFile: string | null = null

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
  const dateStr = new Date().toISOString().split('T')[0]
  logFile = path.join(LOG_DIR, `llm-${dateStr}.log`)
} catch (e) {
  console.error('[Worker] Failed to initialize LLM log file:', e)
}

function logLlm(entry: Record<string, unknown>): void {
  if (!logFile) return
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
    ...(entry.promptLength ? { promptChars: entry.promptLength } : {})
  }) + '\n'
  try { fs.appendFileSync(logFile, line) }
  catch (e) {
    console.error('[Worker] Failed to write LLM log:', e)
  }
}

const prisma = new PrismaClient()

/**
 * Process a single assessment job — called by the BullMQ worker.
 * Orchestrates: fetch → validate → prompt → LLM call → parse → update DB.
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

  const questions = (assessment.criteriaSet.questions as unknown) as CriteriaQuestion[]

  if (questions.length === 0) {
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'REJECTED', rejectionReason: 'No active criteria questions found' }
    })
    return
  }

  // Step 2: Build prompts (delegated to PromptBuilder)
  const typedAssessment = assessment as Assessment & { hcp: Hcp; specialty?: Specialty | null }
  const { systemPrompt, userPrompt } = buildPrompt(typedAssessment, questions)

  // Step 3: Call LLM (delegated to LLMClient — swappable provider)
  let llmContent: string
  const startTime = Date.now()
  // Store the user prompt for audit trail (truncated to 100k chars to avoid bloat)
  const llmUserPrompt = userPrompt.length > 100000 ? userPrompt.substring(0, 100000) + '\n...[truncated]' : userPrompt
  console.log(`[Worker] Assessment ${assessmentId} — calling LLM (prompt: ${userPrompt.length} chars)`)
  logLlm({
    assessmentId,
    event: 'llm_request_start',
    promptLength: userPrompt.length,
    systemPromptLength: systemPrompt.length
  })
  console.log(`[Worker] HCP: ${typedAssessment.hcp.firstName} ${typedAssessment.hcp.lastName}`)
  console.log(`[Worker] CV text length: ${assessment.cvText?.length || 0} chars`)
  console.log(`[Worker] Questions: ${questions.length}`)
  try {
    const client = createLLMClient()
    const response = await client.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
    llmContent = response.content
    console.log(`[Worker] LLM returned ${llmContent.length} chars of content (${Date.now() - startTime}ms)`)
    logLlm({
      assessmentId,
      event: 'llm_response',
      contentLength: llmContent.length,
      durationMs: Date.now() - startTime
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isNetworkError = String(error).includes('fetch failed') || 
                           String(error).includes('ENOTFOUND') || 
                           String(error).includes('ECONNREFUSED') ||
                           String(error).includes('ETIMEDOUT')
    console.error(`[Worker] LLM call failed for assessment ${assessmentId}`)
    console.error(`[Worker] Full error:`, error)
    if (isNetworkError) {
      console.error(`[Worker] NETWORK DIAGNOSIS:`)
      console.error(`  LLM_BASE_URL = ${process.env.LLM_BASE_URL || 'http://localhost:11434'}`)
      console.error(`  LLM_MODEL = ${process.env.LLM_MODEL || 'qwen3.6-35b-a3b'}`)
      console.error(`  Test connectivity: curl -X POST ${process.env.LLM_BASE_URL}/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"${process.env.LLM_MODEL}","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'`)
    }
    // Store error context so admin can see what went wrong and retry
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'AI_FAILED',
        aiResults: JSON.stringify([{ questionId: 'error', selectedAnswerId: null, rationale: `LLM call failed: ${errorMessage}` }]),
        llmUserPrompt,
        completedAt: new Date()
      }
    })
    return
  }

  // Log raw response for debugging (always store — critical for diagnosing empty responses)
  logLlm({
    assessmentId,
    event: 'response_raw_snippet',
    snippet: llmContent.substring(0, 500) || '(empty)',
    fullLength: llmContent.length
  })

  if (!llmContent) {
    console.warn('Empty LLM response')
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'AI_FAILED',
        aiResults: JSON.stringify([{ questionId: 'error', selectedAnswerId: null, rationale: `Empty LLM response — model returned no content` }]),
        llmUserPrompt,
        llmRawResponse: '',
        completedAt: new Date()
      }
    })
    return
  }

  // Step 4: Parse results (delegated to ResponseParser)
  const aiResults = parseLLMResponse(llmContent, questions)

  if (aiResults.length === 0) {
    console.warn('No valid AI results parsed from LLM response')
    // Store diagnostic info for debugging — include raw snippet and count of extracted items
    const snippet = llmContent.length > 300 ? llmContent.substring(0, 300) + '...' : llmContent
    console.warn(`LLM response (first 300 chars): ${snippet}`)
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'AI_FAILED',
        aiResults: JSON.stringify([
          {
            questionId: 'error',
            selectedAnswerId: null,
            rationale: `No valid AI results parsed. The model may have returned malformed JSON, missing fields (questionId/selectedAnswerId), or invalid answer IDs.`
          },
          {
            questionId: '_diagnostic',
            selectedAnswerId: null,
            rationale: `Raw output snippet: ${snippet}`
          }
        ]),
        llmRawResponse: llmContent,
        llmUserPrompt,
        completedAt: new Date()
      }
    })
    return
  }

  // Step 5: Compute total score and update assessment
  const totalScore = aiResults.reduce((sum, r) => {
    const question = questions.find(q => q.id === r.questionId)
    const answer = question?.answers.find(a => a.id === r.selectedAnswerId)
    return sum + (answer?.score ?? 0)
  }, 0)

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      status: 'AI_COMPLETE',
      aiResults: JSON.stringify(aiResults),
      llmRawResponse: llmContent,
      llmUserPrompt,
      totalScore,
      completedAt: new Date()
    }
  })

  console.log(`Assessment ${assessmentId} processed — score: ${totalScore}, results: ${aiResults.length} questions`)
}
