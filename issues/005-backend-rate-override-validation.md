# Issue #5 — Rate override rationale not validated

## Problem
Per CONTEXT.md: *"When a BU or Admin overrides the system-suggested rate, a mandatory rationale field must be filled in."*

The `approveWithTier` method in `domain/assessment.ts` accepts `rateOverride` and `rationale` parameters but **never validates** that `rationale` is provided when `rateOverride` is used. The `rateOverride` is also never compared against the auto-calculated rate to determine if an override actually occurred.

```typescript
// Current — no validation:
const { tierLabel, rateOverride, rationale, ... } = req.body
const assessment = await domain.approveWithTier(
  id, tierLabel, rateOverride, rationale, ...
)
```

## Files
- `apps/backend/src/domain/assessment.ts` — `approveWithTier` method (~300 lines)
- `apps/backend/src/routes/assessments.ts` — POST `/:id/approve` handler

## Proposed Solution
1. In `approveWithTier`, compare `rateOverride` against the auto-calculated rate
2. If they differ, require `rationale` to be non-empty
3. Record the override in the audit trail with the rationale
4. Add validation in the route handler as a safety net

## Acceptance Criteria
- Rate override without rationale returns 400 error
- Override rationale is recorded in audit trail
- Auto-calculated rate (no override) works without rationale
