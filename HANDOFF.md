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

## What's next (in progress)
The approved breakdown:

| # | Issue Title | Type | Blocked By | Status |
|---|-------------|------|------------|--------|
| 1 | Foundation setup | AFK | None | ✅ Done |
| 2 | Specialties management (SA) | AFK | 1 | 🔵 In Progress |
| 3 | Criteria sets management (SA) | AFK | 2 | ⏳ Blocked |
| 4 | HCP master record CRUD | AFK | 1 | 🟢 Ready |
| 5 | User authentication & role management | AFK | 1 | 🟢 Ready |
| 6 | AI worker service | AFK | 3, 4 | ⏳ Blocked |
| 7 | Assessment creation by BU | AFK | 4, 6 | ⏳ Blocked |
| 8 | Admin review workflow | HITL | 7 | ⏳ Blocked |
| 9 | Tier/rate assignment & expiry tracking | AFK | 8 | ⏳ Blocked |
| 10 | BU dashboard & notifications | AFK | 5, 8 | ⏳ Blocked |

Legend: ✅ Done | 🔵 In Progress | 🟢 Ready (unblocked) | ⏳ Blocked

## Key domain decisions to remember
- HCPs are master identity records; Assessments are discrete evaluation events
- Assessment lifecycle: DRAFT → SUBMITTED → AI_PROCESSING → AI_COMPLETE → UNDER_REVIEW → APPROVED/REJECTED
- Criteria sets can be shared across specialties (e.g., prescriber vs non-prescriber)
- Tier locked to score; rate overrideable with mandatory rationale
- Single-worker async AI processing against local LLM (Qwen3.6-35B-a3b)
- Logical multi-tenancy via `tenant_id` on every record
- Notifications: in-app + email by default, active for all users

## Suggested skills to invoke next
- **triage** — to label issues as ready for AFK agents once published
- **to-prd** — if a formal PRD is needed before implementation starts
