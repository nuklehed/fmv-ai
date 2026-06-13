# Issue #15 — Split criteria sets route into resource-specific modules

## Problem
`apps/backend/src/routes/criteriaSets.ts` is 658 lines and handles CRUD for three nested resources:
1. Criteria sets (6 endpoints)
2. Questions (3 endpoints under `/:criteriaSetId/questions`)
3. Answers (3 endpoints under `/:criteriaSetId/questions/:questionId/answers`)

This is a monolithic route file that violates the single responsibility principle. It also makes it hard to find specific endpoints and hard to test individual resources.

## Proposed Solution
Split into a route directory:

```
routes/
  criteriaSets.ts        # Criteria set CRUD (top-level)
  questions.ts           # Question CRUD (nested under criteria set)
  answers.ts             # Answer CRUD (nested under question)
```

Each file handles one resource with its own router:

```typescript
// routes/questions.ts
const router = Router()
router.post('/:criteriaSetId/questions', ...)
router.put('/:criteriaSetId/questions/:questionId', ...)
router.delete('/:criteriaSetId/questions/:questionId', ...)

// In criteriaSets.ts, mount:
import questionRoutes from './questions'
router.use('/', questionRoutes)
```

## Acceptance Criteria
- No single route file exceeds 250 lines
- Each resource (criteria set, question, answer) has its own file
- API endpoints remain unchanged (backward compatible)
- Auth middleware still applies correctly
