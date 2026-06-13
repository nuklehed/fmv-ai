# FMV App — Domain Glossary

## HCP (Healthcare Professional)
A licensed, registered, or certified individual who provides health care services. Includes physicians, nurses, dentists, pharmacists, and allied health workers. **Not a user of the system.** Each HCP has an internal surrogate key as their primary identifier. Zero or more optional external identifiers may be attached (NPI number, state license ID, DEA number). Duplicate detection uses fuzzy matching on name + any provided identifiers.

### HCP Master Data
Persistent identity information: name, contact details (email, phone, address), specialty, and external identifiers. Editable by Admins at any time. This is the "who" of the person — it changes over time as the HCP's circumstances change.

## User Roles
Three distinct roles govern access to the system:
- **BU (Business User):** Can create new assessment requests. Views only HCPs they submitted. Cannot edit approved assessments. Receives notifications about their submissions' status changes.
- **Admin:** Full CRUD on all HCPs and assessments across the system. Reviews AI selections, overrides answers, approves or rejects assessments. Assigns tiers and rates. Cannot change application settings or manage users.
- **SA (Superadmin):** All Admin capabilities plus: manages application configuration (tier ranges, approval validity period, score-to-tier mappings), manages user accounts (creates/deletes BUs and Admins).

## Assessment Status
The lifecycle of an Assessment follows this state machine:
- **DRAFT:** BU is filling out the form (not yet submitted)
- **SUBMITTED:** BU has submitted; assessment enters the AI queue
- **AI_PROCESSING:** AI is analyzing the CV against criteria
- **AI_COMPLETE:** AI has finished analysis; Admin/SA can review and override selections
- **UNDER_REVIEW:** Admin/SA is reviewing; they may approve or reject
- **APPROVED:** Final state. Assessment is valid for a configurable period (default 2 years). Tier and rate assigned.
- **REJECTED:** Terminates this Assessment instance. Immutable — preserved as audit trail. BU creates a new Assessment to resubmit.

## Assessment
A discrete evaluation event tied to an HCP master record. Created when a BU requests an assessment for an HCP (either new or existing). Contains the submitted form data and CV text, AI analysis results, Admin/SA review decisions, and final tier/rate assignment. Each Assessment has its own lifecycle and score — it is not an edit of another Assessment.

### Assessment Data Snapshot
Immutable once finalized: CV text at time of submission, AI selections with rationale, score, tier assignment, rate, status, and who approved or rejected it. This is the "what happened" snapshot — it never changes even if the HCP's master data is updated later.

## Criteria Set
A collection of questions and scored answers that can be shared across one or more HCP specialties. Each criteria set has a configurable system prompt (editable only by SA) that guides the AI's evaluation behavior. When a BU creates an assessment, they select an HCP's specialty, which maps to the appropriate criteria set. A single criteria set may apply to multiple specialties — e.g., one "prescriber" criteria set and another for non-prescribers.

## Criteria Set Prompt
A system-level instruction given to the AI when processing assessments for a specific specialty. Configurable only by SA — Admins cannot edit prompts due to risk of misconfiguration affecting all downstream scoring.

## Rate Override
When a BU or Admin overrides the system-suggested rate, a mandatory rationale field must be filled in. The override is recorded alongside the score-based recommendation for audit purposes. Tier assignment remains locked to the score — only the rate can be overridden. No formal approval workflow for extreme overrides at this time; organizational controls (Legal/Compliance contract review) serve as the check.

## AI Processing
Assessments are processed asynchronously via a message queue. A single worker picks up submitted assessments sequentially, calls the local LLM (Qwen3.6-35B-a3b) to evaluate CV text against criteria, stores results with rationale, and updates assessment status. Local hosting eliminates external API costs and rate limits but introduces variable processing times based on available compute resources.

## Deployment Model
The system supports both locally-hosted (air-gapped/offline) and cloud-deployed configurations. Offline deployment is a key requirement for organizations that cannot expose HCP personally identifiable information to external services. The AI worker communicates with the LLM via local API calls regardless of deployment mode.

## Assessment Expiry
An approved assessment has a configurable validity period (default 2 years). When it expires, the assessment status becomes **EXPIRED** — its tier and rate are no longer valid for new engagements. Expired assessments remain in the system as historical records. Renewal requires a completely new assessment submission with full lifecycle; no fast-track or shortcut paths.

## Expiry Notification
The system proactively notifies BUs and Admins when an approved assessment is approaching expiry. The reminder lead time is configurable (default 30 days before expiration). Notifications are sent to all users who interacted with the assessment.

## Notification Delivery
Notifications are delivered via both in-app alerts and email by default for every user. Email ensures visibility even if users don't log in regularly. Users can toggle notifications on or off, but they are active by default — no BU can claim non-receipt as an excuse for missed renewals.

## Audit Trail
Every state transition and data mutation is logged as an immutable audit event containing: who (user ID + name at time of action), what changed (field name, old value, new value), when (timestamp), and why (rationale field for overrides/rejections). Append-only — no edits or deletions ever. Visible to Admins and SAs only; BUs see their own submission history but not the detailed audit trail.

## BU Assessment Visibility
BUs can see the final outcome of their assessments (approved/rejected, tier, rate) but NOT the detailed AI-vs-Admin comparison. The granular breakdown of AI selections versus Admin overrides is restricted to internal review and compliance purposes only.

## Specialty
A managed master list of HCP practice categories (e.g., "Cardiology," "Dermatology," "Pediatrics"). Defined and maintained by SAs. BUs cannot create new specialties — they must contact Admin/SA to add one. Each specialty maps to one or more criteria sets based on functional role (prescriber vs non-prescriber).

## Assessment Form
The BU-facing form for creating an assessment submission:
- **Name** (pre-populated from HCP master record)
- **Specialty** (pre-populated from HCP master record)
- **External IDs** (NPI, licenses — pre-populated from HCP master record)
- **Contact Info** (email, phone, address — editable by BU; edits update the HCP master record in real time)
- **CV/Resume PDF upload** (required — converted to text for AI analysis)
- **Additional context** (free-text field for any extra information the BU wants to provide)

No engagement type, effective date, or desired rate range fields. Rate assignment is determined solely by score-to-tier mapping and percentile configuration — BU expectations do not influence it.

## Authentication
Enterprise deployments use SSO/SAML/OIDC through a corporate identity provider (Azure AD, Okta, etc.). Standalone/local deployments use built-in username/password authentication with optional MFA. User provisioning is handled centrally by the IdP in enterprise mode; SAs create accounts manually in standalone mode.

### Account Verification
SA-created accounts require email verification by default. The SA can override and verify a user account manually, bypassing the email step.

## Multi-Tenancy
Logical multi-tenancy: one codebase with every record scoped to a `tenant_id`. Each tenant (organization) has isolated data — their own HCPs, assessments, users, criteria sets, specialties, and configuration. Other tenants' data is invisible. SAs manage users only within their own tenant.

## Project File Conventions

### Frontend (`apps/frontend/src/views/`)
Group files by feature/domain. Drop the `View` suffix — it's redundant with Vue Router's `<RouterView>`.

```
views/
├── auth/Login.vue                          # Authentication pages
├── dashboard/Home.vue                      # Dashboard / overview
├── assessment/                             # Assessment CRUD surface
│   ├── AssessmentList.vue                  # Index/listing page
│   ├── AssessmentForm.vue                  # Create / edit form
│   └── AssessmentReview.vue                # Admin review page
├── hcp/HcpProfile.vue                      # HCP profile detail
└── settings/                               # Settings & admin pages
    ├── SettingsDashboard.vue               # Admin/SA settings hub
    ├── NotificationSettings.vue            # User notification prefs
    ├── ApplicationSettings.vue             # App-level config (SA)
    ├── CriteriaSets.vue                    # Criteria set CRUD
    ├── Specialties.vue                     # Specialty CRUD
    ├── TierRates.vue                       # Tier rate management
    └── UserManagement.vue                  # User CRUD
```

**Rules:** New view files go in the feature folder that matches their domain. Name by domain concept, not by URL path or admin task. Use `PascalCase.vue` (no suffix).

### Backend (`apps/backend/src/`)

| Directory | Purpose | Naming |
|---|---|---|
| `routes/` | Express route handlers (one per API resource) | `PascalCase.ts` matching domain entity (e.g., `assessments.ts`, `hcps.ts`) |
| `services/` | Business logic & background workers | `camelCase.ts` describing the service (e.g., `expiryChecker.ts`, `hcpService.ts`) |
| `middleware/` | Auth, error handling, route group factories | `camelCase.ts` describing the concern (e.g., `routeGroups.ts`, `errorHandler.ts`) |
| `domain/` | Shared domain models & utilities | `PascalCase.ts` or `camelCase.ts` |
| `types/` | TypeScript type definitions | `index.ts` |
| `config.ts` | Environment variable validation & exports | Stays at `src/config.ts` (small single file) |

**Rules:** Route files map one-to-one with API resource paths. Service files handle business logic, not HTTP concerns. Router-group factories live in `middleware/`, not `routes/`. Seed scripts live in `prisma/seeds/` with numeric prefixes for execution order (e.g., `01-main.ts`, `02-criteria-sets.ts`).

## Next Steps
Review the SYSTEM.md for role and development rules
Design principles are in the /design-principles skill
See the latest updates in HANDOFF.md