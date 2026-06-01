import { Queue, Worker } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// ─── Queue Definitions ──────────────────────────────────────────────

export const AI_QUEUE_NAME = 'ai-processing'

let aiQueue: Queue | null = null

export function getAIQueue(): Queue {
  if (!aiQueue) {
    aiQueue = new Queue(AI_QUEUE_NAME, { connection: { url: REDIS_URL } })
  }
  return aiQueue
}

// ─── Worker Definition ──────────────────────────────────────────────

let aiWorker: Worker | null = null

export function getAIWorker(): Worker {
  if (!aiWorker) {
    // Import worker logic dynamically to avoid circular dependencies
    const processAssessmentJob = require('./worker').processAssessmentJob

    aiWorker = new Worker(
      AI_QUEUE_NAME,
      async (job: any) => {
        return await processAssessmentJob(job.data.assessmentId, job.data.userId)
      },
      { connection: { url: REDIS_URL }, concurrency: 1 } // Single worker as per ADR-0002
    )

    aiWorker.on('completed', (job: any) => {
      console.log(`✅ Job ${job.id} completed for assessment ${job.data.assessmentId}`)
    })

    aiWorker.on('failed', (job: any, err: Error) => {
      console.error(`❌ Job ${job?.id} failed:`, err.message)
    })

    aiWorker.on('error', (err: Error) => {
      console.error('AI Worker error:', err.message)
    })
  }
  return aiWorker
}

// ─── Queue Statistics ───────────────────────────────────────────────

export async function getQueueStats() {
  const queue = getAIQueue()
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount()
  ])

  return { waiting, active, completed, failed }
}

// ─── Cleanup ────────────────────────────────────────────────────────

export async function closeConnection(): Promise<void> {
  if (aiWorker) {
    await aiWorker.close()
    aiWorker = null
  }
  if (aiQueue) {
    await aiQueue.close()
    aiQueue = null
  }
}
