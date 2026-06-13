# Issue #16 — Remove duplicated auth logic from App.vue

## Problem
`App.vue` (274 lines) contains its own notification fetch/mark-read logic that duplicates what could be in a composable or API layer:

```typescript
// App.vue — notification logic
async function fetchUnreadCount() { ... }
async function fetchNotifications() { ... }
async function markNotificationAsRead(id: string) { ... }
async function markAllNotificationsAsRead() { ... }
```

This logic:
- Manually constructs auth headers from `localStorage`
- Has its own polling interval
- Is mixed with the navigation template

## Files
- `apps/frontend/src/App.vue` — lines ~1–80 (notification logic)

## Proposed Solution
1. Create `composables/useNotifications.ts`:
   ```typescript
   export function useNotifications() {
     const unreadCount = ref(0)
     const notifications = ref<Notification[]>([])
     
     async function fetchUnreadCount() { ... }
     async function fetchNotifications() { ... }
     async function markAsRead(id: string) { ... }
     async function markAllAsRead() { ... }
     
     return { unreadCount, notifications, fetchUnreadCount, ... }
   }
   ```

2. `App.vue` becomes a pure template + small script (~80 lines)

## Acceptance Criteria
- `App.vue` script section <30 lines
- Notification logic in dedicated composable
- Same behavior, same polling interval
- No raw fetch in App.vue
