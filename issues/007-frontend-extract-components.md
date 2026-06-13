# Issue #7 — Extract reusable Vue components

## Problem
The frontend has 13 view files totaling 5,365 lines with no component library. Views are doing too much:

| View | Lines | Issues |
|---|---|---|
| `AssessmentFormView.vue` | 855 | Form state, HCP search, CV upload, validation — all in one file |
| `CriteriaSetsView.vue` | 812 | Criteria set CRUD, question CRUD, answer CRUD, tier thresholds |
| `AssessmentsListView.vue` | 721 | Table, pagination, filters, grouping, status badges |
| `ReviewView.vue` | 658 | AI results comparison, override editor, approve/reject |
| `HcpProfileView.vue` | 487 | Identity card, stats, assessment timeline |
| `App.vue` | 274 | Nav bar, notification bell, dropdown, overlay — should be separate components |

## Proposed Solution
Extract these shared components:

### Navigation
- `NavBar.vue` — top nav with links, user info, logout
- `NotificationBell.vue` — bell icon, badge, dropdown panel
- `NotificationPanel.vue` — notification list, mark-all-read

### Tables & Lists
- `DataTable.vue` — generic table with sorting, pagination, status badges
- `StatusBadge.vue` — status color/label display
- `PaginationBar.vue` — page controls

### Forms
- `HcpSearchSelect.vue` — HCP search + select dropdown
- `CvUpload.vue` — PDF upload with text extraction progress
- `AssessmentStatusFilter.vue` — status filter dropdown

### Assessment-specific
- `AiResultsTable.vue` — AI results with overrides
- `ApprovalForm.vue` — tier/rate/rationale form
- `AssessmentTimeline.vue` — HCP assessment history

## Acceptance Criteria
- `App.vue` reduced to <100 lines (nav + notification components)
- `AssessmentFormView.vue` reduced to <400 lines
- Each extracted component has a single responsibility
- No visual or behavioral changes to existing UI
