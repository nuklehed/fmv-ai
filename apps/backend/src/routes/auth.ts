import { Router } from 'express'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()
const prisma = new PrismaClient()

// JWT configuration — loaded from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'

/**
 * POST /api/auth/login
 * Authenticate user with email/password (standalone mode) or redirect to SSO (enterprise mode)
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    // Find user by email (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email.toLowerCase(), mode: 'insensitive' as const },
        isActive: true
      }
    })

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    // Verify password (standalone mode only — SSO users have no passwordHash)
    if (!user.passwordHash) {
      res.status(403).json({ error: 'Account requires SSO login. Contact your administrator.' })
      return
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    // Check email verification (enforced by default for SA-created accounts)
    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Email not verified',
        requiresVerification: true,
        message: 'Please verify your email address before logging in. Contact your administrator if you need assistance.'
      })
      return
    }

    // Generate access token (short-lived)
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    )

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/refresh
 * Refresh access token using a valid refresh token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' })
      return
    }

    // Verify refresh token
    let decoded: any
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET) as { userId: string; type: string }
    } catch (err) {
      res.status(401).json({ error: 'Invalid or expired refresh token' })
      return
    }

    // Ensure it's a refresh token (not an access token used as refresh)
    if (decoded.type !== 'refresh') {
      res.status(401).json({ error: 'Invalid token type' })
      return
    }

    // Find user and verify they're still active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        emailVerified: true
      }
    })

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' })
      return
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    res.json({ accessToken })
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/auth/me
 * Get current authenticated user's profile
 */
router.get('/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json(user)
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/auth/logout
 * Invalidate refresh token (client-side cleanup + server-side blacklist optional)
 */
router.post('/logout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // In a production system, you'd add the refresh token to a blacklist/revocation store.
  // For now, we rely on token expiration — clients should clear stored tokens.
  res.json({ message: 'Logged out successfully' })
})

/**
 * POST /api/auth/change-password
 * Change password for standalone mode users
 */
router.post('/change-password', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' })
      return
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { passwordHash: true, email: true }
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // SSO users cannot change password via this endpoint
    if (!user.passwordHash) {
      res.status(403).json({ error: 'Password changes are only available for standalone mode accounts' })
      return
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValid) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash: hashedPassword }
    })

    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
