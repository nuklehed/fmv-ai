# Handoff — FMV App Project

## What was done
1. **Grilled the user on `project_plan.md`** — resolved all domain concepts through a grill-with-docs session
2. **Created `CONTEXT.md`** — comprehensive domain glossary with 16+ entries (HCP, Assessment, Criteria Set, Audit Trail, etc.)
3. **Created 3 ADRs in `docs/adr/`:**
   - `0001-assessments-as-discrete-events.md` — Assessments are discrete events, not HCP record updates
   - `0002-async-single-worker-ai-processing.md` — Async queue, single worker, local LLM
   - `0003-logical-multi-tenancy.md` — tenant_id on every record

## What's next (in progress)
**Breaking the plan into 10 tracer-bullet issues and publishing them to GitHub.** The approved breakdown:

| # | Issue Title | Type | Blocked By |
|---|-------------|------|------------|
| 1 | Foundation setup | AFK | None |
| 2 | Specialties management (SA) | AFK | 1 |
| 3 | Criteria sets management (SA) | AFK | 2 |
| 4 | HCP master record CRUD | AFK | 1 |
| 5 | User authentication & role management | AFK | 1 |
| 6 | AI worker service | AFK | 3, 4 |
| 7 | Assessment creation by BU | AFK | 4, 6 |
| 8 | Admin review workflow | HITL | 7 |
| 9 | Tier/rate assignment & expiry tracking | AFK | 8 |
| 10 | BU dashboard & notifications | AFK | 5, 8 |

**Blocker:** GitHub CLI (`gh`) was just installed and needs authentication. The user is reloading the chat to get `gh` working, then will:
- Run `gh auth login`
- Create repo at https://github.com/nuklehed/fmv-ai (if not already done)
- Notify this agent to publish the 10 issues

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
