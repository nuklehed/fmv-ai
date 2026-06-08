# Handoff — FMV App Project

## What was done
1. **Grilled the user on `project_plan.md`** — resolved all domain concepts through a grill-with-docs session
2. **Created `CONTEXT.md`** — comprehensive domain glossary with 16+ entries (HCP, Assessment, Criteria Set, Audit Trail, etc.)
3. **Created 3 ADRs in `docs/adr/`:**
   - `0001-assessments-as-discrete-events.md` — Assessments are discrete events, not HCP record updates
   - `0002-async-single-worker-ai-processing.md` — Async queue, single worker, local LLM
   - `0003-logical-multi-tenancy.md` — tenant_id on every record
4. **Published 10 tracer-bullet issues to GitHub** (nuklehed/fmv-ai) with agent briefs and triage labels
5. **Completed Issue #1 — Foundation setup:**
   - Monorepo structure: `apps/frontend/`, `apps/backend/`, `packages/shared/`
   - Frontend: Vue 3 + TypeScript + Vite + Tailwind CSS + PrimeVue + Pinia + Vue Router 4+
   - Backend: Express + Prisma ORM with complete schema (12 models)
   - Docker Compose: PostgreSQL 16 + Redis 7
   - GitHub Actions CI pipeline (lint + type-check)
   - README.md, .env.example files, .gitignore
   - All code committed and pushed to main branch
6. **Completed Issue #2 — Specialties management (SA):**
   - Backend: SA-only middleware (`authenticate`, `requireSA`), CRUD routes for `/api/specialties`
   - Multi-tenant isolation via `tenantId` on all queries
   - Duplicate name detection (case-insensitive, per tenant) with 409 responses
   - Soft-delete via `isActive` flag instead of hard delete
   - Frontend: SpecialtiesView admin page with table, search, add/edit modals, deactivate action
   - Role-based navigation link (SA-only placeholder guard — full auth in issue #5)
   - All code committed and pushed to main branch
7. **Completed Issue #3 — Criteria sets management (SA):**
   - Backend: Full nested CRUD for criteria sets → questions → answers under `/api/criteria-sets`
   - SA-only system prompt editing; Admins get 403 on prompt modifications
   - Score validation: non-negative integer enforced at API level
   - Multi-tenant isolation via tenantId chain (answer → question → criteria set → tenant)
   - Frontend: CriteriaSetsView with expandable tree view, modals for all three levels
   - System prompt modal with purple styling and SA-only warning banner
   - Score badges displayed as blue circles next to each answer
   - Role-based navigation link (Admin/SA placeholder guard — full auth in issue #5)
   - All code committed and pushed to main branch
8. **Completed Issue #4 — HCP master record CRUD:**
   - Backend: Full CRUD for `/api/hcps` with fuzzy duplicate detection via external identifiers
   - Paginated, searchable, sortable list (search across name/email/state/identifiers)
   - Sortable by lastName, firstName, state, specialtyName, createdAt; pagination 10/25/50 per page
   - POST creates HCPs with optional multiple external identifiers (NPI, licenses); returns 409 on identifier match
   - PUT replaces all identifiers atomically; partial updates supported
   - Frontend: Complete home page as HCP directory per domain spec
     - Table with columns: Name, Identifier, State, Specialty, Tier, Rate, Status, Effective Date, Renewal Date
     - Add HCP modal, detail slide-over panel for view/edit
     - Color-coded status badges matching assessment lifecycle states
   - Navigation links to Specialties and Criteria Sets pages (placeholder role guards)
   - All code committed and pushed to main branch
9. **Completed Issue #5 — User authentication & role management:**
   - Backend: Full auth API (`/api/auth`) with login, refresh, me, logout, change-password endpoints
     - JWT access tokens (7d) + refresh tokens (30d); bcrypt password hashing (12 rounds)
     - Email verification enforced by default; SSO users supported via null passwordHash
   - Backend: SA-only user management (`/api/users`) with full CRUD
     - Duplicate email detection, role assignment (BU/Admin/SA), email verification toggle
     - Safety measure: prevents self-deactivation
   - Frontend: Global nav bar in App.vue with role-based link visibility (SA=red badge, Admin=purple, BU=blue)
   - Frontend: Login page with gradient design, loading states, error handling for unverified accounts
   - Frontend: SA-only User Management page with paginated table, add/edit modals, deactivate action
   - Frontend: API client with automatic token refresh on 401 responses
   - Router: Token validation guard via /api/auth/me verification
   - All code committed and pushed to main branch
10. **Completed Issue #6 — AI worker service:**
    - Backend: BullMQ queue + single-worker sequential processing (ADR-0002) with Redis connection
      - Graceful shutdown handling (SIGTERM/SIGINT); queue stats endpoint
    - Backend: Worker service fetches assessment context, calls local LLM (Ollama-compatible), parses JSON results
      - Robust JSON extraction from LLM response; validates answers against valid sets per question
      - Stores AI results as immutable JSONB with rationale; computes totalScore
    - Backend: Full Assessment CRUD routes (`/api/assessments`)
      - Paginated list (BUs see own, Admins/SAs see all); searchable/filterable by status
      - PDF upload via multer + pdf-parse text extraction (10MB max, 50 char min)
      - Status transitions with validation: DRAFT→SUBMITTED→AI_PROCESSING→AI_COMPLETE→UNDER_REVIEW→APPROVED/REJECTED
    - Frontend: AssessmentFormView — 4-step guided form (Select HCP → Edit Contact → Details → Upload CV)
      - Searchable HCP dropdown, pre-populated editable contact fields, specialty/criteria set selectors
      - Drag-and-drop PDF upload with progress indicator; auto-updates HCP master record on submit
    - Frontend: AssessmentsListView — Paginated table with status badges, score display, auto-refresh during AI processing
      - Detail slide-over panel showing HCP info, AI results with rationale, rejection reason
    - Prisma schema: Added tenantId to Assessment; fixed all missing reverse relations (Specialty.assessments, CriteriaSet.assessments, Tier.assessments, User.submittedAssessments/approvedAssessments)
    - Auth middleware: Fixed authenticate() JWT verification (was placeholder); added requireBUOrHigher guard
    - All code committed and pushed to main branch
11. **Completed Issue #7 — Assessment creation by BU:**
    - Backend: Added POST /api/hcps/bu-create endpoint for BU-facing HCP creation
      - Supports all HCP fields: firstName, lastName, email, phone, address, state, specialtyId, identifiers
      - Fuzzy duplicate detection with 409 responses for exact identifier matches
      - Name-only matches trigger warnings (not blocking) as per domain spec
      - Multi-tenant isolation enforced via tenantId on all queries
    - Frontend: Added 'Create New HCP' button in AssessmentFormView.vue search section
      - Inline form for creating new HCPs during assessment workflow
      - Fields: First Name, Last Name (required), Email, Phone, Address, State, Specialty
      - Smooth slide-fade transition animation for the new form
      - Auto-selects newly created HCP after successful creation
      - Updates editable contact fields from newly created HCP data
      - Proper loading states and error handling
    - All code committed and pushed to main branch
12. **Completed Issue #8 — Admin review workflow (HITL):**
    - Backend: Added PUT /api/assessments/:id/review endpoint for overriding AI answer selections
      - Admins can override each question's selected answer with rationale
      - Supports adding new overrides beyond original AI results
      - Validates answers against valid sets per question
      - Calculates total score from final results (AI + overrides)
      - Transitions to UNDER_REVIEW or REJECTED based on rejection reason
    - Backend: Added POST /api/assessments/:id/approve endpoint for approval workflow
      - Auto-assigns tier based on score if not specified
      - Supports rate override with validation against tier bounds
      - Calculates rate using percentile logic (default 50th)
      - Sets effective/renewal dates (default 2-year validity from application settings)
      - Validates tier belongs to tenant and specialty matches
    - Backend: Added POST /api/assessments/:id/reject endpoint for rejection workflow
      - Requires rejection reason
      - Transitions to REJECTED status
      - Notifies BU of rejection via Notification model
    - Backend: Created GET /api/tiers endpoint for listing tiers (Admin/SA only)
      - Full CRUD routes for tier management with validation
    - Frontend: Enhanced detail panel with admin review capabilities
      - AI results display with override mode for Admin/SA users
      - Override form per question: answer selection dropdown, rationale textarea
      - Add/remove override functionality
      - Approve section with tier selection, rate override, and rationale fields
      - Reject section with required rejection reason field
      - Status-based UI visibility (review only for AI_COMPLETE, approve/reject for UNDER_REVIEW)
      - Auto-refresh assessment list after review actions
      - Error handling and loading states throughout
    - Audit trail created for all review actions via AuditTrail model
    - All code committed and pushed to main branch
13. **Completed Issue #9 — Tier/rate assignment & expiry tracking:**
    - Backend: Added pagination to GET /api/tiers endpoint (page, limit, totalCount)
    - Backend: Created ApplicationSettings CRUD routes (`/api/application-settings`)
      - SA-only access; upsert by key_tenantId unique constraint
      - Supports flexible JSONB values for any system config
    - Backend: Created user notification preferences endpoints (`/api/userSettings/me/settings`)
      - GET returns inApp/email toggle defaults (both true)
      - PUT upserts per-user preferences
    - Backend: Implemented daily cron-based expiry checker service (`services/expiryChecker.ts`)
      - Runs at 8 AM by default (configurable via EXPIRY_CHECKER_CRON env var)
      - Checks for APPROVED assessments approaching renewal date
      - Creates in-app notifications for submitting BU + all Admins/SAs
      - Urgency levels: URGENT (≤7 days), HIGH (≤14 days), NORMAL (≤30 days)
      - Graceful shutdown integration with SIGTERM/SIGINT handlers
    - Frontend: Created TierManagementView — SA-only tier CRUD page
      - Paginated table with name, specialty, score range, rate range, percentile columns
      - Add/Edit modals with validation (min≤max scores, low≤high rates)
      - Delete action with confirmation dialog
    - Frontend: Created ApplicationSettingsView — SA-only system config page
      - Approval validity period editor (default 730 days = 2 years)
      - Expiry reminder lead time editor (default 30 days)
      - System-wide notification channel status display
    - Schema: Added EXPIRED assessment status enum value
    - Schema: Added Notification.user relation and ApplicationSetting.userId field
    - Dependencies: Added node-cron package for scheduled jobs
    - All code committed and pushed to main branch
    - ⚠️ Requires database migration: `npx prisma migrate dev` when DB is available
14. **Completed Issue #10 — BU dashboard & notifications:**
    - Backend: Created full notification API (`/api/notifications`)
      - GET with pagination, unread filter, and unreadCount in response
      - GET /unread-count for lightweight bell badge polling
      - PUT /:id/read to mark individual notification as read
      - PUT /mark-all-read to bulk-mark all as read
      - DELETE /:id to remove a notification
    - Frontend: Redesigned HomeView as BU Dashboard with role-based assessment view
      - Stats cards: Total, In Progress, Approved, Expiring Soon counts
      - Paginated assessment table with HCP, status, score, tier, rate, renewal columns
      - Color-coded expiry urgency badges (green >60d, yellow 30-60d, red <30d)
      - Detail slide-over panel showing full assessment info including tier/rate/expiry
    - Frontend: Added notification bell in App.vue nav bar with unread count badge
      - Auto-polls /api/notifications/unread-count every 60 seconds
      - Badge shows count (capped at '9+' for readability)
    - Frontend: Created SettingsView — per-user notification channel toggles
      - In-app notifications toggle (default on)
      - Email notifications toggle (default on)
      - Save button with loading state and success/error feedback
    - Router: Added /tiers route (Admin/SA) and /settings route (all users)
    - Auth store: Persisted userRole to localStorage for frontend role checks
    - All code committed and pushed to main branch
15. **Refactor — resilience, consistency & UI cleanup:**
    - Backend: AI worker now optional — graceful fallback when Redis unavailable (synchronous processing via POST /api/assessments/:id/process)
    - Backend: Added pdfjs-dist + pdfkit dependencies for PDF processing
    - Backend: Hardened auth — added authenticate guard to GET /me and POST /logout endpoints
    - Backend: Removed unnecessary Prisma `mode:'insensitive'` flags across all route files (cleaner queries)
    - Backend: Flattened specialty relation into `specialtyName` field on HCP list API response
    - Backend: Added null check for criteriaSet relation in answer CRUD endpoints
    - Backend: Reorganized .env.example with section headers; port → 3001; LLM model → qwen2.5:32b
    - Frontend: Removed duplicate `<header>` nav bars from 6 view files (App.vue provides global nav)
    - Frontend: Login page redirects authenticated users to home instead of showing login form
    - Frontend: Router guard uses authStore.fetchUserProfile() for token validation
    - Frontend: SpecialtiesView uses `accessToken` consistently with auth store
    - Config: Vite proxy target port 3000 → 3001; removed unused tsconfig.node.json reference
    - All code committed and pushed to main branch
16. **Completed Issue #16 — Draft assessments actionable from list view & detail panel:**
    - Frontend: "Continue" (BU) / "Edit" (Admin/SA) action buttons on DRAFT rows in AssessmentsListView
    - Detail panel shows role-specific draft actions — "Continue Assessment" for BUs, "Edit Draft" + "Delete Draft" for Admin/SA
    - Edit mode via `/assessments/edit/:id` route pre-populates existing draft data (HCP, specialty, criteria set)
    - CV upload state shown in edit mode; delete with confirmation dialog
    - All code committed and pushed to main branch
17. **Completed Issue #19 — Remove duplicate 'App Settings' nav link:**
    - Frontend: Only one "Settings" link exists in App.vue (no duplicate)
    - ApplicationSettingsView accessible at `/settings/control-center/application-settings` for Admin/SA users
    - All code committed and pushed to main branch
18. **Completed Issue #20 — Consolidate settings nav links into Settings control center:**
    - Frontend: `/settings` renders SettingsView directly (notification settings for all users)
    - Frontend: `/settings/control-center` renders SettingsControlCenterView with sidebar layout (Admin/SA only)
    - Control center has nested routes for specialties, criteria-sets, tiers, users, application-settings
    - "Switch to Control Center" link in SettingsView visible only to Admin/SA users
    - All code committed and pushed to main branch
19. **Completed Issue #21 — Enforce role-based access control in router navigation guard:**
    - Frontend: Added role checks to `beforeEach` guard enforcing `requiresSA`, `requiresAdminOrSA`, `requiresBUOrHigher`
    - Unauthorized users redirected to home dashboard instead of allowing direct URL access
    - All code committed and pushed to main branch
20. **Completed Issue #22 — Fix blank Settings page due to Vue Router 4 empty path child route mismatch:**
    - Frontend: Restructured routes so `/settings` renders SettingsView directly (notification settings)
    - Control center layout behind `/settings/control-center` for Admin/SA users
    - Added "Switch to Control Center" link in SettingsView visible only to Admin/SA users
    - All code committed and pushed to main branch
21. **Completed Issue #23 — Fix ApplicationSettingsView v-model binding:**
    - Frontend: Reactive `ref<number>` variables (`approvalValidityPeriod`, `expiryReminderLeadTime`) bound to v-model
    - Populated from API response in fetchSettings; handleSave reads directly from them
    - All code committed and pushed to main branch

The approved breakdown:

| # | Issue Title | Type | Blocked By | Status |
|---|-------------|------|------------|--------|
| 1 | Foundation setup | AFK | None | ✅ Done |
| 2 | Specialties management (SA) | AFK | 1 | ✅ Done |
| 3 | Criteria sets management (SA) | AFK | 2 | ✅ Done |
| 4 | HCP master record CRUD | AFK | 1 | ✅ Done |
| 5 | User authentication & role management | AFK | 1 | ✅ Done |
| 6 | AI worker service | AFK | 3, 4 | ✅ Done |
| 7 | Assessment creation by BU | AFK | 4, 6 | ✅ Done |
| 8 | Admin review workflow | HITL | 7 | ✅ Done |
| 9 | Tier/rate assignment & expiry tracking | AFK | 8 | ✅ Done |
| 10 | BU dashboard & notifications | AFK | 5, 8 | ✅ Done |
| 16 | Draft assessments actionable from list view & detail panel | Enhancement | None | ✅ Done |
| 19 | Remove duplicate 'App Settings' nav link | Bug | None | ✅ Done |
| 20 | Consolidate settings nav links into Settings control center | Enhancement | None | ✅ Done |
| 21 | Enforce role-based access control in router navigation guard | Bug | None | ✅ Done |
| 22 | Fix blank Settings page due to Vue Router 4 empty path child route mismatch | Bug | None | ✅ Done |
| 23 | Fix ApplicationSettingsView v-model binding to function call | Bug | None | ✅ Done |
| 24 | UX: Show processing feedback when submitting assessment for AI evaluation | Enhancement | None | ✅ Done |
| 25 | Remove unused dependencies (axios, ioredis, pdf-parse, pdfkit, @primevue/themes) | Cleanup | None | ✅ Done (`c371943`) — fallow confirmed zero unused deps remaining |
| 26 | Remove 14 unused exports + 5 unused types via fallow fix | Cleanup | None | ✅ Done (`1dc0012`) — dead-code now shows only 1 issue (mock-server.ts) |
| 27 | Delete dead mock-server.ts (279 lines, zero imports) | Cleanup | None | ✅ Done (`a8f7a54`) — fallow confirms **zero** dead code issues across entire monorepo |
| 33 | Fix AI review failures: LLM prose output, prompt date injection, placeholder filtering | Bug | None | ✅ Done (`1489e3c`) — UUID prose fallback + simplified prompt + evaluation date injection |
| 28 | **Refactor — eliminate duplicated auth/error patterns in frontend views + backend route middleware:**
    - Backend: Created `routes/saRouter.ts` with 4 factory functions (`createSaRouter`, `createAdminRouter`, `createAuthedRouter`, `createBuRouter`) that replace the repeated `router.use(authenticate)` / `router.use(requireSA|requireAdminOrSA|requireBUOrHigher)` pattern across all route files
    - Refactored 9 backend route files to use factories instead of inline middleware chains
    - Frontend: Created `composables/useCrud.ts` with shared `getAuthHeaders()` and `apiFetch(url, options)` helpers that centralize auth header injection + error handling
    - Refactored 4 admin views (SpecialtiesView, TierManagementView, UserManagementView, CriteriaSetsView) to use the composables — removed ~600 lines of duplicated fetch/auth/error code
    - Created `composables/usePagination.ts` generic pagination composable for future list views
    - All code committed and pushed to main branch |
| 29 | **Refactor — link Tiers to CriteriaSets instead of Specialties (domain-correct):**
    - Schema: Removed `Tier.specialtyId`, added `Tier.criteriaSetId` with relation to `CriteriaSet`
    - Schema: Moved `tiers` relation from `Specialty` model to `CriteriaSet` model
    - Backend: Updated `routes/tiers.ts` — all CRUD endpoints now use `criteriaSetId` instead of `specialtyId`, criteria set lookups instead of specialty lookups, include `criteriaSet.name` in responses
    - Frontend: Updated `TierManagementView.vue` — Specialty dropdown replaced with CriteriaSet dropdown, table header changed to "Criteria Set", API calls send `criteriaSetId`
    - Frontend: Updated TypeScript types — `Tier` interface now has `criteriaSetId: string` and optional `criteriaSet?: { id; name }`
    - ⚠️ Requires database migration: `npx prisma migrate dev` when DB is available (Prisma client still has old types until migration runs)
    - All code committed and pushed to main branch |

22. **Completed Issue #33 — Fix AI review failures: LLM prose output, prompt date injection, placeholder filtering:**
    - **Root cause**: qwen3.6-35b-a3b was returning markdown bullet-point prose (e.g., `**Question UUID**: \`answerUUID\``) instead of raw JSON. The `response_format: { type: "json_object" }` parameter was tried but causes 400 Bad Request with this model via Ollama's OpenAI-compatible endpoint.
    - **Fix — responseParser.ts**: Added `extractUuidPairsFromProse()` fallback that runs *before* the positional ID fallback. Parses 4 prose patterns:
      - Bullet-point with bold question label and backtick answer: `- **Question <UUID> (Label)**: \`<UUID>\``
      - "Question UUID: UUID" or "UUID → UUID" pairs
      - Line-by-line two-UUID lines
      - Multi-line: "Question <UUID>" header followed by answer UUID within ~300 chars
    - **Fix — promptBuilder.ts**: Simplified the output format section (removed verbose example block that may have been teaching prose formatting). Injected evaluation date: static "June 2026" anchor in system prompt, dynamic `new Date()` ISO string in user prompt header so time-based criteria like "past 7 years" evaluate correctly.
    - **Fix — llmClient.ts**: Added `temperature: 0.1` for more deterministic output.
    - **Fix — ReviewView.vue**: Filtered placeholder rationales (`Extracted from prose`, `default rationale`) from Phase 2 display via `PLACEHOLDER_PATTERNS` check in `getAiRationale()`.
    - **Seed data**: Created `prisma/seed-fmv-tiers.ts` with FMV HCP Tiers criteria set — 10 questions, 51 answers, max possible score = 35. Deterministic UUIDs, idempotent upsert logic. Added `db:seed-fmv-tiers` npm script.
    - **Frontend**: Assessment domain refactor (`domain/assessment.ts`), AssessmentsListView detail panel fixes, SettingsControlCenterView cleanup, removed unused `usePagination.ts` composable.
    - ⚠️ If the model still returns prose, the UUID prose fallback will parse it — but the ideal is raw JSON output. Consider switching to a model that supports `response_format: json_object` (e.g., gpt-4o, claude) for guaranteed parsing.

## Key domain decisions to remember
- HCPs are master identity records; Assessments are discrete evaluation events
- Assessment lifecycle: DRAFT → SUBMITTED → AI_PROCESSING → AI_COMPLETE → UNDER_REVIEW → APPROVED/REJECTED/EXPIRED
- Criteria sets can be shared across specialties (e.g., prescriber vs non-prescriber)
- Tiers are scoped to CriteriaSets (not Specialties) — tiers define score ranges within a criteria set's rubric
- Rate overrideable with mandatory rationale
- Single-worker async AI processing against local LLM (qwen2.5:32b via Ollama)
- Logical multi-tenancy via `tenant_id` on every record
- Notifications: in-app + email by default, active for all users

## Session notes — 2026-06-08 (AI review fix)
### What was done
| # | What |
|---|------|
| 1 | **Root cause identified**: qwen3.6-35b-a3b returns markdown bullet-point prose (`**Question UUID**: \`answerUUID\``) instead of raw JSON. Tried `response_format: { type: "json_object" }` but Ollama rejects it with 400 for this model |
| 2 | **Added UUID prose fallback** in `responseParser.ts`: `extractUuidPairsFromProse()` parses 4 patterns — bullet-point bold+backtick, "Question UUID: UUID", two-UUID lines, multi-line header+answer — runs *before* positional fallback |
| 3 | **Simplified system prompt** in `promptBuilder.ts`: removed verbose example block (may have been teaching prose formatting), replaced with concise instruction. Added evaluation date injection: static "June 2026" anchor in system prompt, dynamic ISO date in user prompt |
| 4 | **Added temperature: 0.1** in `llmClient.ts` for more deterministic output |
| 5 | **Filtered placeholder rationales** in `ReviewView.vue`: `getAiRationale()` now checks against `PLACEHOLDER_PATTERNS` (`Extracted from prose`, `default rationale`) to hide UI noise from fallback parsing |
| 6 | **Created FMV HCP Tiers seed**: `seed-fmv-tiers.ts` with 10 questions, 51 answers, max score 35. Deterministic UUIDs, idempotent upsert. Added `db:seed-fmv-tiers` npm script |
| 7 | **Frontend cleanup**: assessment domain refactor, AssessmentsListView detail panel fixes, SettingsControlCenterView updates, removed unused `usePagination.ts` |

### Current blockers (user-side)
- **Docker Desktop** — needs to be running for PostgreSQL + Redis containers. Once up:
  ```bash
  docker compose up -d          # start postgres + redis
  npm run db:seed               # create default users
  npm run db:seed-fmv-tiers     # seed FMV HCP Tiers criteria set
  npm run dev                   # start backend + frontend
  ```
- **Port conflicts** — old node processes can linger. If ports are in use:
  ```bash
  netstat -ano | findstr :3001   # find PID on port 3001
  taskkill //PID <pid> //F       # kill it
  ```
- **AI review still shows "Working..."** — if the frontend gets stuck in a loading state, check that the worker is actually processing. The detail panel `loading` ref may not be resetting if the API call fails silently. Verify the assessment transitions from `AI_PROCESSING` → `AI_COMPLETE` (or `AI_FAILED`).

## Session notes — 2026-06-05 (architecture deepening)
### Completed refactors
| # | What | Commit |
|---|------|--------|
| 1 | Collapsed `routes/assessments.ts` (~700 lines) → `domain/assessment.ts` (9-method domain module, routes now ~240 lines thin adapters) | `0666649` |
| 2 | Split monolithic AI worker into `promptBuilder.ts`, `llmClient.ts`, `responseParser.ts` + thin orchestrator | `a61ee0c` |
| 3 | Extracted assessment lifecycle from two frontend views (~1100 lines) → `frontend/src/domain/assessment.ts` (shared helpers + 15 API ops) | `63268a2` |

### Bug fixes in this session
- **Frontend domain module missing auth headers** — all 15+ fetch() calls were unauthenticated. Added `authHeaders()` helper that reads `accessToken` from localStorage and attaches Bearer token.
- **FormData upload corrupted by JSON Content-Type** — `authHeaders()` was injecting `'Content-Type': 'application/json'` into every request, breaking the multipart boundary on CV uploads. Created separate `authHeadersFormData()` for file uploads (no Content-Type header, lets browser set boundary).
- **Backend `.env` pointed at production DB** — `DATABASE_URL` and `REDIS_URL` were still pointing at `diskstation.local:5430` / `6379`. Changed to `localhost:5432` / `6379` for local Docker.

### Session notes — 2026-06-05 (UX improvements)
#### Completed
| # | What |
|---|------|
| 1 | **Issue #24 — Submission feedback UX**: Replaced inline success message with prominent blue gradient banner on assessment submission. Shows "Assessment Submitted for AI Evaluation" header, processing time explanation, and live countdown timer (4s). User is redirected to `/assessments` where the list auto-refreshes every 30s showing `AI_PROCESSING` status with spinner animation. The existing "Submitting..." loading state on the button during API call remains unchanged. |
| 2 | **Issue #24 follow-up — Submission error handling**: Fixed three bugs in submission flow:
   - Error messages now render inside the submission banner (not hidden in a small form field)
   - Non-DRAFT assessments are blocked from editing with a clear warning + redirect
   - LLM model reference updated to `qwen3.6-35b-a3b` across `.env.example` and `llmClient.ts`
| 3 | **Issue #24 follow-up — Post-AI workflow**: After AI completes (`AI_COMPLETE`), Admin/SA opens the detail panel to review, override answers, and approve/reject with tier/rate overrides. The list auto-refreshes every 30s while processing.

#### Known issues
- **Git repository corruption** — some older commit trees are missing (`aa8961f`, `c7402fd`, etc.). Current HEAD and recent commits work fine, but `git status`/`git add` fail with "unable to read tree" errors. Workaround: use plumbing commands (`git hash-object`, `git mktree`, `git commit-tree`) or do a fresh clone if needed. |



#### Newly discovered issues (2026-06-06)
| # | GitHub Issue | Description |
|---|-------------|-------------|
| 1 | ~~[#25](https://github.com/nuklehed/fmv-ai/issues/25)~~ ✅ **COMPLETED** (`1b1b58e`) - Added AI_FAILED red badge + "AI Failed" label, `isFailed()`/`canRetry()` helpers, retry button in list view (BU for own, Admin/SA for any), and error reason display in detail panel with Ollama guidance |
| 2 | ~~[#26](https://github.com/nuklehed/fmv-ai/issues/26)~~ ✅ **COMPLETED** (`ba919b7` + `4f1da09` + `f90fdce`) - Added ⚠️ Action Required badge, Needs Review filter, AND dedicated `/assessments/:id/review` page with two-phase workflow:
   - Phase 1: Read-only AI results display
   - Start Review → transitions AI_COMPLETE → UNDER_REVIEW
   - Phase 2: Editable answer dropdowns (with rationale when different from AI), live score counter, tier/rate selection, approve button
   - Nav improvement: Clicking the Action Required badge OR any AI_COMPLETE row navigates directly to `/assessments/:id/review` (reduced from 3 clicks → 1 click)
| 3 | ~~[#27](https://github.com/nuklehed/fmv-ai/issues/27)~~ ✅ **COMPLETED** (`78288f9`) - Added `GET /api/llm/health` endpoint (checks Ollama + model loaded status), pre-flight check in frontend before submission, clear error messages with actionable guidance (e.g., "ollama pull qwen3.6-35b-a3b") |
| 4 | **AI_FAILED retry UX improvement** (`ef39b4a`) — When retry fails due to unparsable LLM output:
   - Backend worker now stores raw LLM output snippet (first 300 chars) in aiResults as `_diagnostic` entry
   - Frontend detail panel shows parsed error messages instead of raw JSON
   - Added "Show diagnostic info" toggle to view raw LLM output for debugging
   - Added retry button directly in detail panel footer (no need to go back to list)
| 5 | **LLM response parsing fix** (`152cf6a`) — Model was returning wrong field names:
   - `question` instead of `questionId`, `selected_answer` instead of `selectedAnswerId`
   - Answer IDs wrapped in brackets: `[a2]` instead of `a2`
   - Fixed responseParser to handle these aliases + strip bracket wrappers
   - Strengthened prompt with explicit WRONG examples showing the exact pattern to avoid |
| 6 | **LLM positional ID fallback** (`bc64ebc`) — Model now uses completely different format `{"q1": "a2"}`:
   - Added `tryMatchPositionalId()` in responseParser: handles q1, a2, q1a2 patterns → maps to real DB UUIDs
   - Three-tier fallback: exact match → positional matching → reject
   - Strengthened system prompt with explicit 36-char UUID examples and "DO NOT" section
   - Changed user prompt format from `[${answer.id}]` to `ID: ${answer.id} | Score: ...` to avoid bracket confusion |
| 7 | ~~[#28](https://github.com/nuklehed/fmv-ai/issues/28)~~ ✅ **COMPLETED** — Specialty → Criteria Set link:
   - Backend POST now requires criteriaSetId (new specialties are active by default, so activation validation applies to both POST and PUT)
   - PUT validates: cannot activate specialty without a linked criteria set
   - HCP routes reject specialties that don't have a criteria set assigned
   - SpecialtiesView UI shows criteria set name in table row or "Not assigned" in red
   - Add/Edit modals have criteria set dropdown (fetched from `/api/criteria-sets?active=true`)
| 8 | ~~[#29](https://github.com/nuklehed/fmv-ai/issues/29)~~ ✅ **COMPLETED** (`78ec683`) — Tiers linked to Specialty (reverted from CriteriaSet):
   - Schema: `Tier.specialtyId` (nullable FK → Specialty), removed criteriaSetId
   - Manual minScore + maxScore entry (no auto-calculation)
   - No contiguous range validation or last-tier constraint
   - GET /api/tiers sorted by maxScore descending (highest first), specialtyId filter supported
   - TierManagementView: specialty dropdown, manual min/max fields, removed defaultPercentile input
   - CriteriaSetsView: removed tier name badges from answer scores (tiers are specialty-specific now)
   - ReviewView: tier dropdown filters by assessment's specialtyId
   - approveWithTier auto-assign filters by specialtyId instead of criteriaSetId
| 9 | ~~[#31](https://github.com/nuklehed/fmv-ai/issues/31)~~ ✅ **COMPLETED** (`e4008be`) — Auto-resolve criteria set in Assessment form:
   - Removed criteria set dropdown from BU assessment form
   - When user selects a specialty, criteriaSetId auto-populates via Specialty→CriteriaSet FK
   - Read-only hint shown below specialty field confirming auto-resolution
   - fetchSpecialties now returns criteriaSetId alongside id/name
| 10 | ~~[#32](https://github.com/nuklehed/fmv-ai/issues/32)~~ ✅ **COMPLETED** (`e4008be`) — Zero-score flag in review workflow:
   - Red badge "Manual Review Required" appears when admin score = 0
   - Tier auto-assign dropdown disabled for zero-score assessments
   - Approval rationale becomes mandatory when score is zero
   - saveAndApprove validates and blocks approval without rationale

### Current blockers (user-side)
- **Docker Desktop** — needs to be running for PostgreSQL + Redis containers. Once up:
  ```bash
  docker compose up -d          # start postgres + redis
  npm run db:seed               # create default users (sa@fmv.local / admin123, etc.)
  npm run dev                   # start backend + frontend
  ```
- **Port conflicts** — old node processes can linger. If ports are in use:
  ```bash
  netstat -ano | findstr :3001   # find PID on port 3001
  taskkill //PID <pid> //F       # kill it
  ```

## Anti-patterns — DO NOT repeat these
### Backend route middleware
- ❌ **Never write `router.use(authenticate)` / `router.use(requireSA)` inline in individual route files.**
  ✅ Use factories from `routes/saRouter.ts`:
  ```typescript
  import { createSaRouter, createAdminRouter, createAuthedRouter, createBuRouter } from './saRouter'
  const router = createSaRouter()   // or createAdminRouter / createAuthedRouter / createBuRouter
  ```
  The factories are defined in `apps/backend/src/routes/saRouter.ts` — they encapsulate the middleware chain so you only import once.
- ❌ **Never add new `router.use(authenticate)` lines** to any route file. Check `saRouter.ts` first for an existing factory that matches your role requirement.

### Frontend API calls
- ❌ **Never write inline `localStorage.getItem('accessToken')` + fetch() + error handling in view components.**
  ✅ Use composables from `composables/useCrud.ts`:
  ```typescript
  import { getAuthHeaders, apiFetch } from '@/composables/useCrud'
  // Auth header: getAuthHeaders() → { Authorization: 'Bearer <token>' }
  // Fetch with auth + throw on non-2xx: await apiFetch('/api/endpoint', { method: 'POST', body: JSON.stringify(data) })
  ```
- ❌ **Never duplicate pagination logic** (page, limit, totalPages, totalCount, search debounce). Use `composables/usePagination.ts`.

### General
- ❌ **Never add new route files without checking if a factory exists in saRouter.ts** — there are now 4: SA, Admin+, Auth-only, BU+.
- ❌ **Never hardcode role checks (`req.user.role === 'SA'`) in route handlers** — use middleware guards instead.

## Workflow — always run fallow after code changes
When implementing or refactoring code:
1. Make your changes and commit
2. Run `fallow` to check for dead code, unused deps, circular deps, complexity hotspots, architecture violations
3. Fix any issues fallow reports
4. Verify with TypeScript type-check: `cd apps/backend && npx tsc --noEmit` (backend) / `cd apps/frontend && npx vue-tsc --noEmit` (frontend)
5. Only then consider the task done

This prevents accumulating technical debt — unused imports, dead code, and duplicated patterns that AI sessions keep reintroducing.

## Suggested skills to invoke next
- **triage** — to label issues as ready for AFK agents once published
- **to-prd** — if a formal PRD is needed before implementation starts
