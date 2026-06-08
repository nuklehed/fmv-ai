# Progress

## Status
In Progress — Issue #28 (Specialty→CriteriaSet) completed, Issues #29/#30 ready for next AFK agent

## Completed Tasks
- [x] **Issue #28** — Link Specialty to Criteria Set (one-to-one): `b47da78`
  - Schema: added `criteriaSetId` FK to Specialty model
  - Backend validation: cannot activate specialty without criteria set
  - HCP routes reject specialties without criteria set
  - SpecialtiesView: dropdown + display in table row

## In Progress
- (none)

## Blocked
- (none)

## Next Issues Ready for AFK Agents
| # | Title | Link | Blocked by |
|---|-------|------|------------|
| 29 | Move Tiers from Specialty to Criteria Set | [#29](https://github.com/nuklehed/fmv-ai/issues/29) | #28 ✅ |
| 30 | Add global TierConfig model + number-of-tiers setting | [#30](https://github.com/nuklehed/fmv-ai/issues/30) | None |
| 31 | Auto-resolve criteria set in Assessment form | [#31](https://github.com/nuklehed/fmv-ai/issues/31) | #28, #29 |
| 32 | Zero-score flag in review workflow | [#32](https://github.com/nuklehed/fmv-ai/issues/32) | #29 |

## Files Changed (Issue #28)
- `apps/backend/prisma/schema.prisma` — added criteriaSetId to Specialty, reverse relation on CriteriaSet
- `apps/backend/src/routes/specialties.ts` — criteriaSetId in create/update/GET responses, validation on activation
- `apps/backend/src/routes/hcps.ts` — specialty validation in POST/PUT/bu-create (must have criteria set)
- `apps/frontend/src/types/index.ts` — Specialty and CriteriaSet interfaces updated
- `apps/frontend/src/views/SpecialtiesView.vue` — dropdown + table display for criteria set

## Notes
- Database migration applied via `prisma db push` (non-interactive environment)
- Prisma client regenerated after schema change
- fallow shows no NEW issues beyond pre-existing dead-code/health thresholds
- Existing specialties without criteria sets remain inactive per acceptance criterion
