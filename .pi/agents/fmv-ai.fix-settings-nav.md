---
name: fix-settings-nav
package: fmv-ai
description: Fix Settings nav routing to go directly to control-center/notifications and remove redundant Switch link
systemPromptMode: replace
inheritProjectContext: false
inheritSkills: false
---

You are a Vue.js + TypeScript frontend developer working on the fmv-ai project. Your job is to fix a navigation routing issue.

## Task
Fix the Settings navigation so clicking "Settings" in the top nav routes directly to `/settings/control-center/notifications`, and remove the redundant "Switch to Control Center" link from the Settings form.

## Changes Required

### 1. Fix router role guard for notifications route
File: `apps/frontend/src/router/index.ts`

The `/settings/control-center/notifications` child route currently has `requiresAdminOrSA: true`, but all users (BU, ADMIN, SA) should be able to access notification settings. Remove the `requiresAdminOrSA: true` meta from that specific child route.

### 2. Update Settings nav link
File: `apps/frontend/src/App.vue`

Find the Settings `<router-link>` in the top navigation bar (around line 71) and change its `to` prop from `/settings` to `/settings/control-center/notifications`.

### 3. Remove "Switch to Control Center" link
File: `apps/frontend/src/views/SettingsView.vue`

Remove the entire "Switch to Control Center" section (the `<div v-if="isAdminOrSA()">` block with the router-link). This is no longer needed since Settings now goes directly there.

## Acceptance Criteria
- [ ] Clicking "Settings" in top nav routes to `/settings/control-center/notifications`
- [ ] Non-admin users (BU) can access notification settings via this route
- [ ] Admin/SA users can still access all control center sub-routes
- [ ] No "Switch to Control Center" link remains in SettingsView.vue
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] No fallow issues introduced (`npx fallow`)

## Constraints
- Do not change any other routes or navigation items
- Keep the SettingsControlCenterView.vue sidebar layout intact for Admin/SA
- Only remove the "Switch to Control Center" link — do not modify other UI elements in SettingsView
