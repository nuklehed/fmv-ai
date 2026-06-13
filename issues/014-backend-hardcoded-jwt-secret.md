# Issue #14 — Hardcoded JWT secret

## Problem
The JWT secret has a hardcoded development default in two places:

```typescript
// middleware/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

// routes/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
```

Issues:
- The same string appears in two files (DRY violation)
- "dev-secret-change-in-production" is a warning that should be caught at build time, not runtime
- If `JWT_SECRET` is missing from env, the app silently starts with the default

## Files
- `apps/backend/src/middleware/auth.ts` — line ~14
- `apps/backend/src/routes/auth.ts` — line ~14

## Proposed Solution
1. Extract to shared config module:
   ```typescript
   // apps/backend/src/config.ts
   export const JWT_SECRET = process.env.JWT_SECRET
   if (!JWT_SECRET) {
     throw new Error('JWT_SECRET environment variable is required')
   }
   ```

2. Import from config in both files
3. Add to `.env.example`:
   ```
   JWT_SECRET=replace-this-with-a-random-string
   ```

## Acceptance Criteria
- App fails to start if `JWT_SECRET` is not set (not silently uses default)
- Secret is defined in one place
- `.env.example` documents the variable
