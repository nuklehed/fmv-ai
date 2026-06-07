// BullMQ is optional — only needed when Redis + local LLM are available.
// In standalone mode (no Redis), assessments can be processed synchronously via the API.

const AI_QUEUE_NAME = 'ai-processing'

let redisAvailable: boolean | null = null
let aiQueue: any = null
let aiWorker: any = null

async function ensureRedis(): Promise<boolean> {
  if (redisAvailable !== null) return redisAvailable
  try {
    const { Queue } = await import('bullmq')
    const testQ = new Queue(AI_QUEUE_NAME + '-test', { connection: { url: process.env.REDIS_URL! } })
    await testQ.close()
    redisAvailable = true
  } catch {
    redisAvailable = false
  }
  return redisAvailable
}

export async function getAIQueue() {
  if (!process.env.REDIS_URL) {
    return null
  }
  const available = await ensureRedis()
  if (!available) return null
  if (!aiQueue) {
    const { Queue } = await import('bullmq')
    aiQueue = new Queue(AI_QUEUE_NAME, { connection: { url: process.env.REDIS_URL! } })
  }
  return aiQueue
}

export async function getAIWorker() {
  if (!process.env.REDIS_URL) {
    return null
  }
  const available = await ensureRedis()
  if (!available) return null
  if (!aiWorker) {
    const { Worker } = await import('bullmq')
    // Import worker logic dynamically to avoid circular dependencies
    const { processAssessmentJob } = await import('./worker')
    aiWorker = new Worker(
      AI_QUEUE_NAME,
      async (job: any) => {
        return await processAssessmentJob(job.data.assessmentId, job.data.userId)
      },
      { connection: { url: process.env.REDIS_URL! }, concurrency: 1 } // Single worker as per ADR-0002
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

// ─── Queue Statistics (Redis-backed, optional) ──────────────────────

async function getQueueStats() {
  if (!aiQueue) return { waiting: 0, active: 0, completed: 0, failed: 0 }
  const [waiting, active, completed, failed] = await Promise.all([
    aiQueue.getWaitingCount(),
    aiQueue.getActiveCount(),
    aiQueue.getCompletedCount(),
    aiQueue.getFailedCount()
  ])
  return { waiting, active, completed, failed }
}

// ─── Cleanup (Redis-backed, optional) ───────────────────────────────

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
