# Issue #1 — Deduplicate HCP creation logic

## Problem
`POST /api/hcps` and `POST /api/hcps/bu-create` in `apps/backend/src/routes/hcps.ts` contain ~130 lines of identical code for HCP creation + duplicate detection (fuzzy matching on name + identifiers, name-only warning, specialty validation). This is a clear DRY violation.

## Files
- `apps/backend/src/routes/hcps.ts` — lines ~180–310 (POST /) and ~320–450 (POST /bu-create)

## Proposed Solution
Extract the shared logic into a private method or a dedicated service:

```typescript
// apps/backend/src/services/hcpService.ts
export async function createHcp(data: CreateHcpInput, tenantId: string, prisma: PrismaClient): Promise<HcpWithWarnings>
```

Both route handlers would call this method, passing in the appropriate auth context. The duplicate detection logic (identifier matching + name-only warning) would live in one place.

## Acceptance Criteria
- Single source of truth for HCP creation logic
- Both endpoints produce identical results
- No change in API contract or response shape
