import { Router } from 'express'
import { createLLMClient } from '../services/llmClient'

const router = Router()

/** GET /api/llm/health — Pre-flight check for Ollama availability and model status */
router.get('/health', (_req, res): void => {
  const client = createLLMClient()
  client.healthCheck().then(result => {
    res.status(result.ok ? 200 : 503).json(result)
  }).catch(() => {
    res.status(503).json({ ok: false, error: 'Health check failed' })
  })
})

export default router
