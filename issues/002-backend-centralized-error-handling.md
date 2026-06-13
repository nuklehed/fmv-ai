# Issue #2 — Centralized error handling middleware

## Problem
Every route handler has its own `try/catch` with ad-hoc error classification logic. Patterns vary:
- Some routes use `_error` (discarded), others use `error` (unused)
- Error classification uses string matching (`error.message.includes('not found')`)
- No consistent HTTP status mapping
- No structured error logging

This makes it hard to add logging, metrics, or change error formats without touching every route.

## Files
- All files in `apps/backend/src/routes/` (12 route files)
- Each route handler repeats the same `try/catch` pattern

## Proposed Solution
Create Express error-handling middleware:

```typescript
// apps/backend/src/middleware/errorHandler.ts
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  // Structured logging
  // Map known error types to HTTP status codes
  // Return consistent JSON error format
}
```

Route handlers would be simplified to:
```typescript
router.get('/', async (req, res) => {
  const result = await domain.listPaginated(...)
  res.json(result)
  // No try/catch needed — errors propagate to middleware
})
```

Use a custom `AppError` class for domain-level errors with HTTP status codes baked in.

## Acceptance Criteria
- Route handlers no longer contain try/catch blocks
- All errors go through a single middleware
- Consistent JSON error response format (`{ error, code?, details? }`)
- Errors logged with context (route, userId, tenantId)
