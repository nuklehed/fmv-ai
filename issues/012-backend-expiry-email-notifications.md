# Issue #12 — Implement email notifications for expiry checker

## Problem
The expiry checker in `services/expiryChecker.ts` creates in-app notifications but has a TODO for email:

```typescript
// TODO: Send email notifications when SMTP is configured
console.log(`  📧 Notification created for HCP: ...`)
```

Per CONTEXT.md: *"Notifications are delivered via both in-app alerts and email by default for every user. Email ensures visibility even if users don't log in regularly."*

## Files
- `apps/backend/src/services/expiryChecker.ts` — TODO on line ~90
- `apps/backend/src/routes/userSettings.ts` — stores `inApp`/`email` preferences per user
- `apps/backend/src/services/worker.ts` — creates notifications for assessment events (same gap)

## Proposed Solution
1. **Add SMTP config** to `.env`:
   ```
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASS=
   SMTP_FROM=notifications@fmv.example.com
   ```

2. **Create email service**:
   ```typescript
   // apps/backend/src/services/email.ts
   export interface EmailService {
     send(to: string, subject: string, html: string): Promise<void>
   }
   export function createEmailService(): EmailService | null
   ```

3. **Create notification template builder**:
   ```typescript
   // apps/backend/src/services/notificationTemplate.ts
   export function buildExpiryReminderEmail(assessment, daysLeft, urgency): string
   export function buildAssessmentApprovedEmail(assessment, tier, rate): string
   export function buildAssessmentRejectedEmail(assessment, reason): string
   ```

4. **Integrate into expiry checker and worker** — send email when user preference allows

## Acceptance Criteria
- Email service is optional (graceful degradation when SMTP not configured)
- Respects per-user notification preferences (`inApp` + `email`)
- Templates for: expiry reminder, assessment approved, assessment rejected, assessment superseded
- No breaking changes to existing in-app notification behavior
