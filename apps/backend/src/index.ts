import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import specialtyRoutes from './routes/specialties'
import criteriaSetRoutes from './routes/criteriaSets'
import hcpRoutes from './routes/hcps'

const app = express()
const prisma = new PrismaClient()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/specialties', specialtyRoutes)
app.use('/api/criteria-sets', criteriaSetRoutes)
app.use('/api/hcps', hcpRoutes)

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
// - Authentication (POST /api/auth/login, POST /api/auth/refresh, GET /api/auth/me)
// - Assessment creation and processing (POST /api/assessments, POST /api/assessments/:id/cv)
// - User management (CRUD /api/users) — SA only

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`🚀 FMV AI Backend running on http://localhost:${PORT}`)
  console.log(`📊 Database: ${process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] ?? 'not configured'}`)
})

export default app
