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
- [x] **#35 — Dashboard Enhancement**: 
  - **Dashboard (HomeView.vue)**: Pure quick-view — no detail panels. Shows only APPROVED assessments, grouped by HCP (one record per person). No pagination, no row-click expanders. Stats cards show active approvals count and expiring-soon alerts. Search-only filter; status dropdown removed. Table rows have Profile link only (no View/expand buttons).
  - **Active approval warning** in `AssessmentFormView.vue`: Amber banner when selecting an HCP with existing approval, showing current tier/score/rate with "View Profile" / "Continue — Re-assess" buttons. Suppressed when continuing an existing draft or in edit mode.
  - **Backend**: New endpoint `GET /api/hcps/:id/active-assessment` for supersession checks; domain-level `listPaginated()` now supports `groupedByHcp` option via `private listGroupedByHcp()`.

## What's Left
**None.** All issues (#33, #34, #35, #36, #37) are closed.

## Key Decisions & Constraints
- **Single Active Approval:** Only one `isActive=true` per HCP at a time. New assessments supersede old ones on Admin approval (not immediately on submission).
- **Dashboard Focus:** Dashboard is strictly a quick view showing approved/non-superseded records — one per HCP. No standalone HCP directory search outside the "Request Assessment" flow.
- **Assessments Page:** Shows all submitted requests. Toggleable "Group by HCP" mode deduplicates to latest assessment per person (supersedes show-all). Pagination disabled in grouped mode.
- **Audit Trail Integrity:** Criteria questions/answers are JSON snapshots attached to each assessment — history preserved even if live criteria change.
- **Profile Access:** BU role or higher can access via Profile links on dashboard rows and detail panels.

## Current State of Codebase
- All backend builds clean (`npx tsc --noEmit` passes)
- Frontend builds clean (`vue-tsc --noEmit` — remaining errors are pre-existing, not from this feature)
- Migration SQL exists at `apps/backend/prisma/migrations/20260611000000_add_assessment_supersession_and_snapshot/`
- Database already has the 5 new columns and FK constraints applied (procedural migration ran via `$executeRawUnsafe`)
- Prisma client regenerated with new schema

**Design Principles** — now captured as a standalone skill: [`.agents/skills/design-principles/SKILL.md`](.agents/skills/design-principles/SKILL.md). Covers typography (Tailwind defaults only), 3-role color palette, whitespace-first layout, and pre-generation checklist.
