# Issue #13 — Prisma client singleton pattern

## Problem
Every route file creates its own `new PrismaClient()`:

```typescript
// routes/assessments.ts
const prisma = new PrismaClient()

// routes/hcps.ts
const prisma = new PrismaClient()

// routes/auth.ts
const prisma = new PrismaClient()

// ... 12 route files total
```

While Prisma does connection pooling, instantiating multiple clients in a long-running process is wasteful. In development with `tsx watch` (file watcher), this creates a new client on every file change, potentially leaking connections.

## Files
- All files in `apps/backend/src/routes/` (12 files)
- `apps/backend/src/domain/assessment.ts` (1 file)
- `apps/backend/src/services/worker.ts` (1 file)
- `apps/backend/src/services/expiryChecker.ts` (1 file)

## Proposed Solution
Create a shared singleton:

```typescript
// apps/backend/src/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

All route files import from `../db` instead of creating new instances.

## Acceptance Criteria
- Single PrismaClient instance per process
- All route files import from shared module
- No connection leaks in development
- `tsc --noEmit` still passes
