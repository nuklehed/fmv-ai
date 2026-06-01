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

## What's next (in progress)
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

Legend: ✅ Done | 🔵 In Progress | 🟢 Ready (unblocked) | ⏳ Blocked

## Key domain decisions to remember
- HCPs are master identity records; Assessments are discrete evaluation events
- Assessment lifecycle: DRAFT → SUBMITTED → AI_PROCESSING → AI_COMPLETE → UNDER_REVIEW → APPROVED/REJECTED/EXPIRED
- Criteria sets can be shared across specialties (e.g., prescriber vs non-prescriber)
- Tier locked to score; rate overrideable with mandatory rationale
- Single-worker async AI processing against local LLM (Qwen3.6-35B-a3b)
- Logical multi-tenancy via `tenant_id` on every record
- Notifications: in-app + email by default, active for all users

## Suggested skills to invoke next
- **triage** — to label issues as ready for AFK agents once published
- **to-prd** — if a formal PRD is needed before implementation starts
