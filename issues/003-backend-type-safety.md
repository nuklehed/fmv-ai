# Issue #3 — Eliminate `any` types in backend

## Problem
The backend uses `any` in 15+ locations, undermining TypeScript's value:

| Location | Issue |
|---|---|
| `domain/assessment.ts` | `type Assessment = any`, `type User = any`, `as any[]`, `as any` casts throughout |
| `routes/assessments.ts` | `req: AuthenticatedRequest & { file?: Express.Multer.File }` |
| `routes/hcps.ts` | `as any` on `where.OR` arrays, `as 'NPI' \| 'STATE_LICENSE' \| 'DEA' \| 'OTHER'` casts |
| `routes/criteriaSets.ts` | `JSON.parse(JSON.stringify(...))` for tier thresholds, `as any` on role comparisons |
| `routes/users.ts` | `role: { equals: search.toUpperCase() as any }` |
| `services/worker.ts` | `as unknown) as CriteriaQuestion[]`, `as Assessment & { ... }` casts |
| `services/queue.ts` | `any` on Queue/Worker types |
| `services/llmClient.ts` | `any` on fetch Response types |

## Proposed Solution
1. Import Prisma-generated types: `import type { Assessment, User, ... } from '@prisma/client'`
2. Replace `type Assessment = any` with the real type
3. Use Prisma's `Select`/`Include` types for query result typing
4. Replace `as any` casts with proper type narrowing or discriminated unions
5. Define proper Multer file type in a shared types file

## Acceptance Criteria
- `grep -r "any" apps/backend/src --include="*.ts" | grep -v node_modules` shows zero `any` usages (excluding `Record<string, unknown>` which is acceptable)
- `tsc --noEmit` still passes
