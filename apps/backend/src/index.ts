import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import specialtyRoutes from './routes/specialties'
import criteriaSetRoutes from './routes/criteriaSets'
import hcpRoutes from './routes/hcps'
import authRoutes from './routes/auth'
import userRoutes from './routes/users'
import assessmentRoutes from './routes/assessments'
import tierRoutes from './routes/tiers'
import notificationRoutes from './routes/notifications'
import userSettingsRoutes from './routes/userSettings'
import { router: applicationSettingsRoutes, tierConfigRouter } from './routes/applicationSettings'
import llmRoutes from './routes/llm'
import { getAIWorker, closeConnection } from './services/queue'
import { startExpiryChecker } from './services/expiryChecker'
import { errorHandler } from './middleware/errorHandler'

const app = express()
const prisma = new PrismaClient()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/llm', llmRoutes)
app.use('/api/assessments', assessmentRoutes)
app.use('/api/specialties', specialtyRoutes)
app.use('/api/criteria-sets', criteriaSetRoutes)
app.use('/api/hcps', hcpRoutes)
app.use('/api/tiers', tierRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/userSettings', userSettingsRoutes)
app.use('/api/application-settings', applicationSettingsRoutes)
app.use('/api/tier-config', tierConfigRouter)

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Database health check
app.get('/api/db/health', async (_req, res) => {
  try {
    await prisma.$connect()
    res.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    console.error('Database connection failed:', error)
    res.status(503).json({ status: 'error', database: 'disconnected' })
  }
})

// ─── Expiry Checker (Background Job) ─────────────────────────────
// Runs daily to check for assessments approaching their renewal date
const expiryChecker = startExpiryChecker(prisma)

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Error Handler (must be last, 4 params) ────────────────────────
app.use(errorHandler)

// ─── Worker Service Startup ────────────────────────────────────────

// Start the AI worker — processes assessments sequentially from BullMQ queue
// Only available when Redis is running; otherwise use synchronous API processing
async function startWorker() {
  const worker = await getAIWorker()
  if (worker) {
    worker.on('ready', () => {
      console.log('🤖 AI Worker service started (single-worker, sequential processing)')
    })
  } else {
    console.log('⚠️  Redis not available — AI worker disabled. Use POST /api/assessments/:id/process for synchronous processing.')
  }
}
startWorker()

// ─── Graceful Shutdown ─────────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received. Starting graceful shutdown...`)

  // Stop expiry checker cron job
  expiryChecker.stop()

  // Close Redis connection (also closes BullMQ queue and worker)
  await closeConnection()

  // Close database connection
  await prisma.$disconnect()

  console.log('✅ All connections closed. Shutting down.')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// ─── Start Server ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`🚀 FMV AI Backend running on http://localhost:${PORT}`)
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl.includes('sqlite')) {
    console.log('📊 Database: SQLite (local file)')
  } else {
    console.log(`📊 Database: ${dbUrl.split('@')[1]?.split(':')[0] ?? 'not configured'}`)
  }
})

export default app
