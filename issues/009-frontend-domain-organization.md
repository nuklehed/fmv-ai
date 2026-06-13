# Issue #9 — Reorganize frontend domain layer

## Problem
`apps/frontend/src/domain/assessment.ts` (300+ lines) mixes three concerns:
1. **Types** — `AssessmentListItem`, `AssessmentDetail`, `AiResultItem`, `ListParams`, `HcpProfileData`
2. **Status helpers** — `STATUS_COLORS`, `STATUS_LABELS`, `getStatusColor()`, `getStatusLabel()`, `canReview()`, `canApprove()`, etc.
3. **API functions** — `fetchAssessments()`, `createDraft()`, `uploadCv()`, etc.

Additionally:
- `types/index.ts` (160 lines) is a dump of all interfaces with no organization
- `composables/useCrud.ts` (26 lines) is a standalone utility with unclear purpose
- Domain types are duplicated between `domain/assessment.ts` and `types/index.ts`

## Proposed Solution
```
src/
  types/
    index.ts         # Re-export all types (thin file)
    api.ts           # API request/response types
    domain.ts        # Domain model types (Assessment, Hcp, etc.)
    ui.ts            # UI-specific types (column definitions, etc.)
  domain/
    assessment.ts    # Assessment domain logic only (status helpers, business rules)
    assessment-api.ts # Assessment API functions (moved from assessment.ts)
  composables/
    useCrud.ts       # Keep as-is (utility)
    useApi.ts        # Generic API composable (new)
    usePagination.ts # Pagination logic (new)
    useStatus.ts     # Status helpers (moved from assessment.ts)
```

## Acceptance Criteria
- `domain/assessment.ts` <100 lines (logic only)
- API functions in separate file
- Types organized by concern
- No duplication between `types/` and `domain/`
