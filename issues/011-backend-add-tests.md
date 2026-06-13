# Issue #11 — Add backend test infrastructure

## Problem
The entire codebase has **zero test files**. No tests exist for:
- Domain logic (status transitions, approval flow, supersession)
- Route handlers (error cases, auth checks)
- Service logic (LLM client, response parsing, prompt building)
- Prisma queries (edge cases, empty results)

## Proposed Solution
1. **Choose test framework**: Vitest (native Vite ecosystem, fast, works with TypeScript)
2. **Choose HTTP testing**: Supertest
3. **Choose mocking**: `@prisma/client` mock via Vitest

```
apps/backend/
  tests/
    unit/
      domain/assessment.test.ts     # AssessmentDomain methods
      services/promptBuilder.test.ts # Prompt generation
      services/responseParser.test.ts # LLM response parsing
      services/llmClient.test.ts     # LLM client behavior
    integration/
      routes/assessments.test.ts     # Full route + DB
      routes/hcps.test.ts           # Full route + DB
    helpers/
      prisma.ts                     # Test database setup
      factory.ts                    # Test data factories
```

4. **Add to package.json**:
   ```json
   "scripts": {
     "test": "vitest",
     "test:ci": "vitest run"
   },
   "devDependencies": {
     "vitest": "^1.2.0",
     "supertest": "^6.3.0",
     "@types/supertest": "^6.0.0"
   }
   ```

5. **Start with high-value targets**:
   - `responseParser.test.ts` — complex parsing logic with many edge cases
   - `domain/assessment.test.ts` — status transition rules
   - `services/promptBuilder.test.ts` — prompt formatting

## Acceptance Criteria
- `npm run test` runs successfully
- Response parser tests cover: JSON, markdown blocks, prose UUID pairs, positional IDs
- Domain tests cover: all valid/invalid status transitions
- Coverage >60% for domain and services
