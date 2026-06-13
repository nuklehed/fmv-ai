# Issue #6 — Consolidate seed scripts

## Problem
There are 5 separate seed scripts totaling 1,161 lines:

| Script | Lines | Purpose |
|---|---|---|
| `seed.ts` | 193 | Base seeding |
| `seed-dev-data.ts` | 596 | Development data |
| `seed-fmv-tiers.ts` | 160 | FMV tier data |
| `seed-tiers.ts` | 98 | Tier configuration |
| `seed-top-specialties.ts` | 114 | Specialty data |

Issues:
- No clear separation between dev/prod seed data
- `seed-dev-data.ts` is 596 lines and likely contains hardcoded test data that could leak
- No seed data management strategy (what seeds run in prod vs dev?)
- Duplicate seed scripts for tiers (`seed-tiers.ts` and `seed-fmv-tiers.ts`)

## Proposed Solution
1. Create a single `seed.ts` entry point that orchestrates sub-seeders
2. Separate into `seeders/` directory:
   ```
   prisma/
     seed.ts              # Entry point — runs environment-appropriate seeders
     seeders/
       base.ts            # Roles, settings, generic data
       specialties.ts     # Specialty list
       tiers.ts           # Tier configuration
       dev-data.ts        # Dev-only test data (skipped in prod)
   ```
3. Use `NODE_ENV` or a `SEED_ENV` variable to control which seeders run
4. Remove duplicate tier scripts — merge into one

## Acceptance Criteria
- Single `npm run db:seed` command
- Dev seed data excluded from production runs
- No duplicate tier seeding logic
