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
    console.error('LLM call failed:', error instanceof Error ? error.message : 'Unknown error')
    // Mark as failed but keep in AI_COMPLETE so admin can review partial results
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'AI_COMPLETE' }
    })
    return
  }

  if (!llmContent) {
    console.warn('Empty LLM response')
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: 'AI_COMPLETE' }
    })
    return
  }

  // Step 4: Parse results (delegated to ResponseParser)
  const aiResults = parseLLMResponse(llmContent, questions)

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
