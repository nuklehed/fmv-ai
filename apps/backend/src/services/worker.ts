import { PrismaClient } from '@prisma/client'
import type { Assessment, Hcp, Specialty } from '@prisma/client'
import { buildPrompt, type CriteriaQuestion } from './promptBuilder'
import { createLLMClient } from './llmClient'
import { parseLLMResponse } from './responseParser'

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
  try {
    const client = createLLMClient()
    const response = await client.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
    llmContent = response.content
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('LLM call failed:', errorMessage)
    // Store error context so admin can see what went wrong and retry
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'AI_FAILED',
        aiResults: JSON.stringify([{ questionId: 'error', selectedAnswerId: null, rationale: `LLM call failed: ${errorMessage}` }]),
        completedAt: new Date()
      }
    })
    return
  }

  if (!llmContent) {
    console.warn('Empty LLM response')
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: 'AI_FAILED',
        aiResults: JSON.stringify([{ questionId: 'error', selectedAnswerId: null, rationale: `Empty LLM response — model returned no content` }]),
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
      totalScore,
      completedAt: new Date()
    }
  })

  console.log(`Assessment ${assessmentId} processed — score: ${totalScore}, results: ${aiResults.length} questions`)
}
