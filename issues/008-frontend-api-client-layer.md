# Issue #8 — Create API client layer

## Problem
API calls are scattered throughout views and the domain layer using raw `fetch`:
- `App.vue` has its own notification fetch logic
- `domain/assessment.ts` has `apiFetch`, `authHeaders`, and ~20 API functions
- `stores/auth.ts` has its own login, refresh, and profile fetch logic
- No request interceptor for token refresh
- No response error normalization

## Files
- `apps/frontend/src/domain/assessment.ts` — ~200 lines of API functions mixed with types
- `apps/frontend/src/stores/auth.ts` — raw fetch calls for auth
- `apps/frontend/src/App.vue` — raw fetch calls for notifications
- Individual views make additional raw fetch calls

## Proposed Solution
Create a dedicated API client:

```
src/
  api/
    client.ts        # Axios/fetch wrapper with auth interceptor, token refresh
    assessments.ts   # Assessment API functions
    hcps.ts          # HCP API functions
    auth.ts          # Auth API functions
    notifications.ts # Notification API functions
    settings.ts      # Settings API functions
```

Benefits:
- Single place for auth header injection
- Automatic token refresh on 401
- Consistent error handling
- Types for request/response shapes
- Easy to swap fetch implementation

## Acceptance Criteria
- No raw `fetch` calls in views
- Auth token refresh is automatic
- All API functions are in dedicated modules
- TypeScript types for all API responses
