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

## Key domain decisions to remember
- HCPs are master identity records; Assessments are discrete evaluation events
- Assessment lifecycle: DRAFT → SUBMITTED → AI_PROCESSING → AI_COMPLETE → UNDER_REVIEW → APPROVED/REJECTED/EXPIRED
- Criteria sets can be shared across specialties (e.g., prescriber vs non-prescriber)
- Tier locked to score; rate overrideable with mandatory rationale
- Single-worker async AI processing against local LLM (qwen2.5:32b via Ollama)
- Logical multi-tenancy via `tenant_id` on every record
- Notifications: in-app + email by default, active for all users

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

## Suggested skills to invoke next
- **triage** — to label issues as ready for AFK agents once published
- **to-prd** — if a formal PRD is needed before implementation starts
