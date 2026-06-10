# Handoff — FMV App Project

## Project overview
**FMV AI** — Fair Market Value assessment platform for healthcare professional (HCP) engagements. Monorepo: Vue 3 + TypeScript + Vite + Tailwind CSS + PrimeVue frontend, Express + Prisma + BullMQ backend, PostgreSQL + Redis via Docker Compose.

## What's done (summary)
All 10 original tracer-bullet issues plus 20+ follow-up fixes/refactors are complete and committed. See `git log` or [GitHub issues](https://github.com/nuklehed/fmv-ai/issues) for per-issue detail.

**Core features built:**
- **HCP CRUD** — master identity records with fuzzy duplicate detection (external identifiers)
- **Specialties & Criteria Sets** — SA-managed CRUD with nested questions → answers, system prompt editing
- **Assessment lifecycle** — DRAFT → SUBMITTED → AI_PROCESSING → AI_COMPLETE → UNDER_REVIEW → APPROVED/REJECTED/EXPIRED
- **AI evaluation** — BullMQ single-worker, local LLM (qwen3.6-35b-a3b via Ollama), PDF CV upload + text extraction, JSON + prose fallback parsing
- **Admin review (HITL)** — override AI answers with rationale, approve with tier/rate, reject with reason, full audit trail
- **Tier/rate system** — SpecialtyRate junction table (specialty × criteriaSet × tierLabel), CriteriaSet.tierThresholds JSONB for score bands
- **Auth & roles** — JWT auth (7d access / 30d refresh), BU/Admin/SA roles, router guards
- **BU dashboard** — stats cards, paginated assessment table, expiry urgency badges, notification bell
- **SA Control Center** — settings page with specialties, criteria-sets, tiers, users, application-settings sub-pages
- **Notifications** — in-app + email toggles, expiry checker cron, approval/rejection notifications

## Key domain decisions
- HCPs = master identity records; Assessments = discrete evaluation events
- Tiers defined by `SpecialtyRate` (specialty × criteriaSet × tierLabel) with rates per band
- Score ranges from `CriteriaSet.tierThresholds` (JSONB, per rubric)
- Single-worker async AI processing against local LLM (qwen3.6-35b-a3b via Ollama)
- Logical multi-tenancy via `tenant_id` on every record
- Assessments can skip questions with no CV evidence (AI doesn't force a selection)

## Anti-patterns — DO NOT repeat
### Backend
- ❌ Never write `router.use(authenticate)` / `router.use(requireSA)` inline
- ✅ Use factories from `routes/saRouter.ts`: `createSaRouter()`, `createAdminRouter()`, `createAuthedRouter()`, `createBuRouter()`
- ❌ Never reference `Tier` model or `tierId` — use `SpecialtyRate` and `tierLabel`
- ❌ Never hardcode tier score ranges — always read from `CriteriaSet.tierThresholds`
- ✅ Always look up rates via `SpecialtyRate` using `(specialtyId, criteriaSetId, tierLabel)` composite key

### Frontend
- ❌ Never write inline `localStorage.getItem('accessToken')` + fetch() + error handling in views
- ✅ Use composables from `composables/useCrud.ts`: `getAuthHeaders()`, `apiFetch()`
- ❌ Never duplicate pagination logic — use `composables/usePagination.ts`

### LLM / Prompt
- ❌ Never write prose/analysis in LLM output — system prompt has explicit DO NOT list + JSON example
- ❌ Never assume AI answers every question — prompt allows skipping; frontend shows "No evidence in CV for this question"
- Custom criteria set `systemPrompt` overrides the default — if model strays, check custom prompts

### General
- ❌ Never add new route files without checking `saRouter.ts` for an existing factory
- ❌ Never hardcode role checks (`req.user.role === 'SA'`) — use middleware guards
- ❌ Never close panel content containers prematurely — the `p-6` container must wrap ALL sections

## Workflow
1. Make changes and commit
2. Run `fallow` → fix any issues
3. Type-check: `cd apps/backend && npx tsc --noEmit` / `cd apps/frontend && npx vue-tsc --noEmit`
4. Only then consider task done

## Setup (user-side)
```bash
docker compose up -d              # PostgreSQL + Redis
npm run db:seed                   # create default users (sa@fmv.local / admin123, etc.)
npm run db:seed-fmv-tiers         # seed FMV HCP Tiers criteria set
npm run dev                       # start backend + frontend
```
- Port conflicts: `lsof -i :3001` to find stale PIDs
- Git repo has some older commit tree corruption; recent commits work fine
- Prisma migrations may need running: `npx prisma migrate dev`

## Current blockers / open items
- **Docker Desktop** must be running for PostgreSQL + Redis
- **Prisma migrations** — `npx prisma migrate dev` needed when DB is available
- **Seed data system prompt** (`seed-fmv-tiers.ts`) is brief and may need updating to match the new default prompt's format instructions
- **LLM prose fallback** still works if model returns prose, but the stronger prompt (concrete JSON example + DO NOT list + FINAL INSTRUCTION block) should minimize this

## Suggested skills to invoke next
- **triage** — to label issues as ready for AFK agents once published
- **to-prd** — if a formal PRD is needed before implementation starts
