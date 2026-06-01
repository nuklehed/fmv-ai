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
import { getAIWorker, closeConnection } from './services/queue'

const app = express()
const prisma = new PrismaClient()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/assessments', assessmentRoutes)
app.use('/api/specialties', specialtyRoutes)
app.use('/api/criteria-sets', criteriaSetRoutes)
app.use('/api/hcps', hcpRoutes)
app.use('/api/tiers', tierRoutes)

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

// TODO: Add route handlers for:
// - Tier/rate assignment & expiry tracking
// - Notification delivery

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ─── Worker Service Startup ────────────────────────────────────────

// Start the AI worker — processes assessments sequentially from BullMQ queue
const aiWorker = getAIWorker()
aiWorker.on('ready', () => {
  console.log('🤖 AI Worker service started (single-worker, sequential processing)')
})

// ─── Graceful Shutdown ─────────────────────────────────────────────

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received. Starting graceful shutdown...`)

  // Stop accepting new jobs
  await aiWorker.close()

  // Close database connection
  await prisma.$disconnect()

  // Close Redis connection (also closes BullMQ queue)
  await closeConnection()

  console.log('✅ All connections closed. Shutting down.')
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// ─── Start Server ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
  console.log(`🚀 FMV AI Backend running on http://localhost:${PORT}`)
  console.log(`📊 Database: ${process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] ?? 'not configured'}`)
})

export default app
