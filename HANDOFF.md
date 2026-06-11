# HANDOFF — HCP Profile Page Feature

**Date:** 2026-06-11  
**Branch:** `feature/hcp-profile-page` (pushed)  
**Issues published:** #33, #34, #35, #36 on GitHub

## What's Done
- [x] **#33 — Backend Profile API + Schema Migration**: New Prisma migration with 5 columns (`isActive`, `supersededAt`, `supersededByAssessmentId`, `previousAssessmentId`, `criteriaSnapshot`), self-referencing FK relations, and `GET /api/hcps/:id/profile` endpoint
- [x] **#34 — Frontend Profile Page View** (503 lines): Dedicated page at `/hcp/:id/profile` with identity card, collapsible summary stats, assessment timeline table; 'Profile' links in dashboard rows + detail panel; route registered with BU+ guard
- [x] **#36 — Auto-supersede on Approval**: `approveWithTier` now atomically approves new + retires old active assessment for same HCP via `$transaction`, with audit trail and notifications
- [x] Criteria snapshot capture in `submitForAI` (freezes questions/answers/scores at evaluation time)
- [x] Frontend TypeScript types added: `AssessmentListItem`, `HcpProfile`, `HcpProfileResponse`, `NotificationType.ASSESSMENT_SUPERSEDED`
- [x] Domain layer: `HcpProfileData` interface + `fetchHcpProfile()` API function

## What's Left

### Issue #37 — Frontend Notification System
The backend now emits `ASSESSMENT_SUPERSEDED` notifications. Need frontend notification badge/list handling for the new type.

### Issue #37 — Frontend Notification System (new, implied)
The backend now emits `ASSESSMENT_SUPERSEDED` notifications. Need frontend notification badge/list handling for the new type.

## Key Decisions & Constraints
- **Single Active Approval:** Only one `isActive=true` per HCP at a time. New assessments supersede old ones on Admin approval (not immediately on submission).
- **Dashboard Focus:** Dashboard is strictly a quick view; no standalone HCP directory search outside the "Request Assessment" flow.
- **Audit Trail Integrity:** Criteria questions/answers are JSON snapshots attached to each assessment — history preserved even if live criteria change.
- **Profile Access:** BU role or higher can access via Profile links on dashboard rows.

## Current State of Codebase
- All backend builds clean (`npx tsc --noEmit` passes)
- Frontend builds clean (`vue-tsc --noEmit` — remaining errors are pre-existing, not from this feature)
- Migration SQL exists at `apps/backend/prisma/migrations/20260611000000_add_assessment_supersession_and_snapshot/`
- Database already has the 5 new columns and FK constraints applied (procedural migration ran via `$executeRawUnsafe`)
- Prisma client regenerated with new schema

## Suggested Skills
- **tdd** — for building dashboard enhancement (Issue #35) test-first
- **grill-with-docs** — to refine UI layout decisions before coding the profile page
- **improve-codebase-architecture** — review overall feature coherence after completion

## Next Step
Issue #35 — dashboard enhancement: add active-approval warning when creating a new assessment for an HCP that already has one. The Profile link infrastructure is already wired up from #34.
